var _ = require('lodash')
  , util = require('util')
  , constants = require('./constants')
  , Base = require('./base')

/**
* This is a collection whose job is to ensure that duplicate instances of
* a model are never created
*/
function ServerManager (opts) {
  Base.apply(this, arguments)

  var self = this

  this.rowChangeListener = function (row) {
    self.onFeedChange(row.doc)
  }

  opts.dbFeed.on('row', this.rowChangeListener)

  this._onOptionsChange = _.bind(this._onOptionsChange, this)
}

util.inherits(ServerManager, Base)

ServerManager.prototype.type = constants.TYPE_SERVER

ServerManager.prototype.onFeedChange = function onFeedChange (doc) {
  var self = this

  _.each(this.subscriptions, function (collection) {
    if(collection == null) {
      return
    }

    // Collections without an onChange method just _fetch every time
    if(!collection.onChange) {
      collection._fetch(self.options.db, self.options.context, function (err, docs) {
        if(err) {
          return self.emit('error', err, collection._id, collection.options)
        }

        var doc_ids = []

        _.each(docs, function (doc) {
          var existingModel = collection.find(doc._id)

          if((typeof collection.belongs != 'function' || collection.belongs(doc)) && !doc._deleted) {
            doc_ids.push(doc._id)

            if(existingModel) {
              _.each(doc, function (value, key) {
                existingModel.set(key, value)
              })
            }
            else {
              collection.add(doc, {sort: false})
            }
          }
          else if(existingModel) {
            // Merge in attributes silently...
            // this is critical otherwise the doc won't be emitted with the new attrs
            _.each(doc, function (value, key) {
              existingModel.set(key, value, {silent: true})
            })

            // Then delete it
            collection.remove(existingModel)
          }
        })

        // Remove things in the collection that aren't in docs anymore
        collection.each(function (model) {
          if(model && doc_ids.indexOf(model.id) < 0)
            collection.remove(model)
        })

        self.flushEvents()
      })
    }
    // Advanced collections on the server behave differently
    else {
      // Async onChange methods need to flush events whenever they are done
      if(collection.onChange.length > 1) {
        collection.onChange(doc, self.options.db, self.options.context, function () {
          self.flushEvents()
        })
      }
      else {
        collection.onChange(doc)
      }
    }
  })

  this.flushEvents()
}

ServerManager.prototype.setClientFeed = function setClientFeed (clientFeed) {
  var self = this

  if(this.options.clientFeed) {
    throw new Error('clientFeed is immutable')
  }

  this.options.clientFeed = clientFeed

  clientFeed.on('subscribe', function (id, opts) {
    self.subscribe(id, opts)
  })

  clientFeed.on('unsubscribe', function (id, opts) {
    self.unsubscribe(id, opts)
  })

  clientFeed.on('ucollection:change', this._onOptionsChange)
}

ServerManager.prototype._onOptionsChange = function _onOptionsChange (collection, oldOpts, newOpts) {
  var targetSubscription
    , last
    , self = this

  targetSubscription = _.find(this.subscriptions, function (subscription) {
    return subscription._id == collection && _.isEqual(_.omit(subscription.options, 'manager'), oldOpts)
  })

  if(targetSubscription != null) {
    targetSubscription._options = newOpts

    targetSubscription._fetch(this.options.db, this.options.context, function (err, docs) {
      if(err) {
        while((last = targetSubscription.last()) != null) {
          targetSubscription.remove(last)
        }

        self.emit('subscribed', err, collection, newOpts)
      }
      else {
        // This makes the minimum number of edits needed
        var toRemove = _.difference(targetSubscription.pluck('_id'), _.pluck(docs, '_id'))

        for(var i=0, ii=toRemove.length; i<ii; ++i)
          targetSubscription.remove(targetSubscription.get(toRemove[i]))

        _.each(docs, function (doc) {
          targetSubscription.add(doc, {merge: true, sort: false})
        })
      }

      self.flushEvents()

      if(!err)
        self.emit('subscribed', null, collection, newOpts)
    })
  }
  else {
    return new Error('Could not unsubscribe from a collection with _id "' + collection + '" and options ' + JSON.stringify(_.omit(oldOpts, 'manager')))
  }
}

// Squash multiple events. Only send the last one. How smert!
ServerManager.prototype.bufferEvent = function bufferEvent (eventname, model, collection) {
  if(!this._eventBuffer[model.id]) {
    this._eventBuffer[model.id] = {type: eventname, order: this._eventCounter, model: model, collection: collection}
  }
  else {
    switch(eventname) {
      case 'add':
        this._eventBuffer[model.id] = {type: eventname, order: this._eventCounter, model: model, collection: collection}
        break
      case 'change':
        if(this._eventBuffer[model.id].type == 'remove') {
          throw new Error('You cannot change a model that was removed in the same tick')
        }
        this._eventBuffer[model.id] = {type: eventname, order: this._eventCounter, model: model, collection: collection}
        break
      case 'remove':
        this._eventBuffer[model.id] = {type: 'remove', order: this._eventCounter, model: model, collection: collection}
        break
    }
  }

  this._eventCounter = this._eventCounter + 1
}

// Call this to send all buffered events
ServerManager.prototype.flushEvents = function flushEvents () {
  var self = this
    , events = _.values(this._eventBuffer)

  this._eventBuffer = {}
  this._eventCounter = 0

  events.sort(function (a, b) {
    return a.order - b.order
  })

  _.each(events, function (eventDetails) {
    if((eventDetails.type == 'add' || eventDetails.type == 'change') && !eventDetails.model.get('_deleted')) {
      self.emit('send', eventDetails.collection.type, eventDetails.model.toJSON())
    }
    else {
      self.emit('delete', eventDetails.collection.type, {_id: eventDetails.model.id, _deleted: true})
    }
  })
}

ServerManager.prototype.subscribe = function subscribe (collection, opts) {
  var self = this
    , collectionInstance

  if(typeof collection != 'string' || typeof opts != 'object') {
    this.emit('subscribed'
      , new Error('Subscribe should be called with (String, Options) on the server'), collection, opts)
  }

  // Search the manifest for this collection
  if(!this.options.manifest[collection]) {
    this.emit('subscribed'
      , new Error('Could not subscribe to collection with _id "' + collection + '" because it does not exist')
      , collection
      , opts)
  }

  // No need to subscribe to a duplicate collection
  if(this.find(collection, opts) != null)
    return

  // Need to put this in a try because people throw in their constructors during option validation
  try {
    collectionInstance = new this.options.manifest[collection](null, _.extend({}, opts, {manager: this}))

    // Don't sort on the server!
    collectionInstance.comparator = null
  }
  catch(e) {
    console.error('Error subscribing: ' + e)
    console.error(e.stack)

    // Emit the event with the error as the first arg
    return this.emit('subscribed'
      , e
      , collection
      , opts)
  }

  // Derived collections are really smart and know the difference!
  collectionInstance.on('add', function (model) {
    self.bufferEvent('add', model, collectionInstance)
  })
  collectionInstance.on('change', function (model) {
    self.bufferEvent('change', model, collectionInstance)
  })
  // Since a model is in this collection IFF it has this unique type, we can delete it for good.
  // It will not be in any other collection!
  collectionInstance.on('remove', function (model) {
    self.bufferEvent('remove', model, collectionInstance)
  })

  collectionInstance._fetch(this.options.db, this.options.context, function (err, docs) {
    if(err) {
      self.flushEvents()
      self.emit('subscribed', err, collection, opts)
    }
    else {
      _.each(docs, function (doc) {
        if(typeof collectionInstance.belongs != 'function' || collectionInstance.belongs(doc))
          collectionInstance.add(doc, {sort: false})
      })

      self.flushEvents()
      self.emit('subscribed', null, collection, opts)
    }
  })

  this.subscriptions.push(collectionInstance)
}

ServerManager.prototype.resubscribe = function resubscribe () {
  throw new Error('Resubscribing only makes sense on the client')
}

ServerManager.prototype.unsubscribe = function unsubscribe (collection, options) {
  var targetSubscription

  targetSubscription = _.findIndex(this.subscriptions, function (subscription) {
    return subscription._id == collection && _.isEqual(_.omit(subscription.options, 'manager'), options)
  })

  if(targetSubscription > -1) {
    this.subscriptions.splice(targetSubscription, 1)
  }
  else {
    return new Error('Could not unsubscribe from a collection with _id "' + collection + '" and options ' + JSON.stringify(_.omit(collection.options, 'manager')))
  }

  this.emit('unsubscribed', collection, _.omit(collection.options, 'manager'))
}

ServerManager.prototype.getUser = function getUser () {
  return this.options.context.user
}

ServerManager.prototype.getUserId = function getUserId () {
  return this.options.context.user._id
}

ServerManager.prototype.destroy = function destroy () {
  if(this.options.clientFeed) {
    this.options.clientFeed.removeAllListeners()
    this.options.clientFeed = null
  }
  if(this.options.dbFeed) {
    this.options.dbFeed.removeListener('row', this.rowChangeListener)
    this.options.dbFeed = null
  }

  _.each(this.subscriptions, function (subscription) {
    subscription.destroy()
  })

  this.removeAllListeners()
}

module.exports = ServerManager

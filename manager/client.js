var _ = require('lodash')
  , util = require('util')
  , constants = require('./constants')
  , Base = require('./base')

/**
* This is a collection whose job is to ensure that duplicate instances of
* a model are never created
*/
function ClientManager (opts) {
  Base.apply(this, arguments)

  var self = this

  opts.serverFeed.on('send', function (identifier, doc) {
    self.onFeedChange('send', identifier, doc)
  })

  opts.serverFeed.on('delete', function (identifier, doc) {
    self.onFeedChange('delete', identifier, doc)
  })

  opts.serverFeed.on('subscribed', function (err, collection, options) {
    self.onSubscribed(err, collection, options)
  })

  this._onOptionsChange = _.bind(this._onOptionsChange, this)
}

util.inherits(ClientManager, Base)

ClientManager.prototype.type = constants.TYPE_CLIENT

ClientManager.prototype.onFeedChange = function onFeedChange (eventType, identifier, doc) {
  var self = this
    , needsSort = []
    , collection = _.find(this.subscriptions, function (c) { return c.type == identifier })

  if(collection) {
    var existingModel = collection.get(doc._id)

    // Deleted docs should always be deleted
    if(existingModel && doc._deleted) {
      collection.remove(existingModel)
      self.emit('delete', doc._id)
      return
    }

    if(eventType == 'send') {
      if(existingModel) {
        _.each(doc, function (value, key) {
          existingModel.set(key, value)
        })
      }
      else {
        collection.add(doc, {sort: false})
      }

      if(typeof collection.comparator == 'function' && needsSort.indexOf(collection) < 0)
        needsSort.push(collection)
    }
    else if(existingModel) {
      // Then delete it
      collection.remove(existingModel)
    }
  }
  else {
    console.error('Feed event for nonexistent collection identifier: ' + identifier)
  }
}

ClientManager.prototype.onSubscribed = function onSubscribed (err, collection, opts) {
  var targetSubscription = _.find(this.subscriptions, function (subscription) {
    return subscription._id == collection && _.isEqual(_.omit(subscription.options, 'manager'), _.omit(opts, 'manager'))
  })

  if(!targetSubscription)
    throw new Error('The subscription ' + collection + ':' + JSON.stringify(_.omit(opts, 'manager')) +
                    ' was not found in ' + this.subscriptions.length + ' subscriptions:\n' +
                    _.map(this.subscriptions, function (t) {return JSON.stringify(_.omit(t.options, 'manager'))}).join('\n'))


  targetSubscription._finishedLoading(err)
}

ClientManager.prototype.setClientFeed = function setClientFeed () {
  throw new Error('Only the server can have a clientFeed')
}

ClientManager.prototype.create = function (Collection, opts) {
  var existingCollection = this.find(Collection.prototype._id, opts)

  opts = _.clone(opts)
  opts.manager = this

  if(existingCollection) {
    return existingCollection
  }
  else {
    return new Collection(null, opts)
  }
}

ClientManager.prototype.subscribe = function subscribe (collection, opts) {
  if(typeof collection != 'object' || typeof collection._id != 'string' || opts == null) {
    throw new Error('Subscribe should be called with (Collection, Options) on the client')
  }

  var oldSubscription = this.find(collection._id, opts)

  if(oldSubscription != null) {
    throw new Error('Cannot subscribe to a duplicate collection')
  }

  this.subscriptions.push(collection)
  collection.on('ucollection:change', this._onOptionsChange)
  this.emit('subscribe', collection._id, opts)
}

ClientManager.prototype._onOptionsChange = function _onOptionsChange (collection, oldOpts, newOpts) {

  newOpts = _.omit(newOpts, 'manager')

  var conflictingSubscription = _.find(this.subscriptions, function (subscription) {
    return subscription._id == collection._id && _.isEqual(_.omit(subscription.options, 'manager'), newOpts)
  })

  if(conflictingSubscription != null && conflictingSubscription !== collection) {
    throw new Error('These options (' + JSON.stringify(newOpts) + ') will cause a conflict with another collection' +
                    ' (' + collection._id + ' vs ' + conflictingSubscription._id + ')')
  }

  this.emit('ucollection:change', collection._id, oldOpts, newOpts)
}

ClientManager.prototype.resubscribe = function resubscribe () {
  var self = this

  _.each(this.subscriptions, function (collection) {
    collection.reset([])
    self.emit('subscribe', collection._id, _.omit(collection.options, 'manager'))
  })
}

ClientManager.prototype.unsubscribe = function unsubscribe (collection, options) {
  var targetSubscription

  if(options) {
    throw new Error('The client Manager does not take options')
  }

  collection.off('ucollection:change', this._onOptionsChange)

  targetSubscription = _.findIndex(this.subscriptions, function (subscription) {
    return subscription._id == collection._id && _.isEqual(_.omit(subscription.options, 'manager'), _.omit(collection.options, 'manager'))
  })

  this.emit('unsubscribe', collection._id, _.omit(collection.options, 'manager'))

  if(targetSubscription > -1) {
    this.subscriptions.splice(targetSubscription, 1)
  }
  else {
    return new Error('Could not unsubscribe from a collection with _id "' + collection + '" and options ' + JSON.stringify(_.omit(collection.options, 'manager')))
  }
}

ClientManager.prototype.getUser = function getUser () {
  return this.options.context.user
}

ClientManager.prototype.getUserId = function getUserId () {
  return this.options.context.user._id
}

ClientManager.prototype.destroy = function destroy () {
  if(this.options.clientFeed) {
    this.options.clientFeed.removeAllListeners()
    this.options.clientFeed = null
  }

  _.each(this.subscriptions, function (subscription) {
    subscription.destroy()
  })

  this.each(function (model) {
    model.destroy()
  })

  this.off()
}

module.exports = ClientManager

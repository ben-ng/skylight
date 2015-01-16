var UniversalCollection = require('../')
  , _ = require('lodash')
  , AggregateCollection

AggregateCollection = UniversalCollection.extend({
  _id: 'AggregateCollection'
, afterInit: function (opts) {
    opts = opts || {}

    if(!opts.substrings) { throw new Error('substrings must be defined') }
  }
, _fetch: function (db, ctx, cb) {
    var self = this
      , results = []

    // Simulate network lag
    setTimeout(function () {
      // For each substring, return an array of ids
      _.each(self.options.substrings, function (substring) {
        results.push({
          members: _.pluck(db.filter(function (doc) {
                    return doc.name && doc.name.indexOf(substring) > -1
                  }), '_id')
        , type: 'aggr'
        , _id: 'aggr:' + substring
        })
      })

      cb(null, results)
    }, 0)
  }
, onChange: function (doc) {
    var self = this

    _.each(this.options.substrings, function (substring) {
      // Does the aggr model already exist?
      var existing = self.findWhere({_id: 'aggr:' + substring})

      if(doc.name && doc.name.indexOf(substring) > -1) {
        if(existing) {
          // This will cause the change event to fire
          existing.set('members', existing.get('members').concat(doc._id))
        }
        else {
          self.add({
            members: [doc._id]
          , type: 'aggr'
          , _id: 'aggr:' + substring
          })
        }
      }
      else if(existing) {
        // Remove this sucker from the existing model
        var findex = existing.get('members').indexOf(doc._id)
          , rej

        if(findex > -1) {
          // If this is not the last model, splice it out
          if(existing.get('members').length > 1) {
            rej = _.clone(existing.get('members'))
            rej.splice(findex, 1)
            existing.set('members', rej)
          }
          // Otherwise, remove the whole aggr model
          else {
            self.remove(existing)
          }
        }
      }
    })
  }
, belongs: function (doc) {
    return doc.type == 'aggr'
  }
})

module.exports = AggregateCollection

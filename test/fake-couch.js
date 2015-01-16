var events = require('events')
  , util = require('util')
  , _ = require('lodash')
  , FakeFeed = require('./fake-feed')

function FakeCouch (fixtures) {
  events.EventEmitter.call(this)

  fixtures = fixtures || []

  this.documents = _(fixtures).map(function (doc) {
    return [doc._id, doc]
  }).object().cloneDeep().valueOf()
}

util.inherits(FakeCouch, events.EventEmitter)

FakeCouch.prototype.changeDoc = function changeDoc (doc) {
  this.emit('row', {change: _.cloneDeep(doc)})
}

FakeCouch.prototype.save = function save (doc) {
  if(!doc._id) { throw new Error('Cannot save doc with no _id') }

  this.documents[doc._id] = _.cloneDeep(doc)

  this.emit('change', this.documents[doc._id])
}

FakeCouch.prototype.get = function get (id, cb) {
  var self = this

  if(cb) {
    setTimeout(function () {
      cb(null, self.documents[id])
    }, 0)
  }
  return this.documents[id]
}

FakeCouch.prototype.all = function all (query, cb) {
  var self = this
    , inQuery

  inQuery = function (doc) {
    return query.keys.indexOf(doc._id) > -1
  }

  setTimeout(function () {
    cb(null, {rows: _.map(_.filter(self.documents, inQuery), function (d) {return {doc: d}})})
  }, 0)
}

FakeCouch.prototype.getFeed = function getFeed () {
  var fakeFeed = new FakeFeed()

  this.on('change', fakeFeed.onChange)

  return fakeFeed
}

FakeCouch.prototype.filter = function filter (func) {
  return _.filter(this.documents, func)
}

module.exports = FakeCouch

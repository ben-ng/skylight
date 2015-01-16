var events = require('events')
  , util = require('util')
  , _ = require('lodash')

function FakeFeed () {
  events.EventEmitter.call(this)

  this.onChange = _.bind(this.onChange, this)
}

util.inherits(FakeFeed, events.EventEmitter)

FakeFeed.prototype.onChange = function onChange (doc) {
  this.emit('row', {doc: _.cloneDeep(doc)})
}

module.exports = FakeFeed

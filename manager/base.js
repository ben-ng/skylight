var EventEmitter = require('events').EventEmitter
  , util = require('util')

function Manager (opts) {
  EventEmitter.call(this)

  this._eventBuffer = {}
  this._eventCounter = 0

  opts = opts || {}

  if(!opts.context) { throw new Error('Manager must be initialized with a context') }
  if(!opts.context.user) { throw new Error('Manager must be initialized with a user doc in context.user') }
  if(!opts.context.user._id) { throw new Error('Manager must be initialized with a user doc with an _id property') }

  this.options = opts
  this.subscriptions = []
}

util.inherits(Manager, EventEmitter)

Manager.prototype.subscriptionCount = function subscriptionCount () {
  return this.subscriptions.length
}

module.exports = Manager

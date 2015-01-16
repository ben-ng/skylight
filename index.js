/**
* A Universal Collection is one that Just Works, whether its used on the client or server
*/
var Backbone = require('backbone')
  , Collection = Backbone.Collection
  , IdAttrModel = Backbone.Model.extend({idAttribute: '_id'})
  , constants = require('./manager/constants')
  , _ = require('lodash')

module.exports = Collection.extend({
  initialize: function (models, opts) {
    var self = this

    this.options = opts || {}

    if(!this._fetch) { throw new Error('Universal Collections must have a _fetch method') }
    if(!this.belongs) { throw new Error('Universal Collections must have a belongs method') }
    if(!this._id) { throw new Error('Universal Collections must be extended with an _id property') }
    if(models != null && models.length) { throw new Error('Universal Collections can not be initialized with any models') }
    if(!opts.manager) { throw new Error('Universal Collections must be initialized with a manager') }

    if(typeof this.afterInit == 'function') {
      this.afterInit(opts)
    }

    this._loadedCallbacks = []
    this._isLoading = false
    this._loadedError = null

    this.__defineGetter__('isLoading', function () {
      return self._isLoading
    })

    this._atomicFunctionQueue = []
    this._isRunningAtomicFunction = false

    this._makeAtomic('fetch')
    this._makeAtomic('_fetch')
    this._makeAtomic('setOptions')

    // The public fetch method is only used on the client, and sends the subscribe event to the server
    if(opts.manager.type == constants.TYPE_CLIENT) {
      this.fetch(function noop () {})
    }
  }
, model: IdAttrModel
, _makeAtomic: function _makeAtomic(propertyName) {
    var self = this
      , nonAtomicPropertyName = '_nonatomic_' + propertyName

    this[nonAtomicPropertyName] = this[propertyName]

    this[propertyName] = function () {
      var args = Array.prototype.slice.call(arguments)

      if(self._atomicFunctionQueue.length > 20) {
        console.error('Warning: Possible recursive call in atomic Universal-Collection function, queue is pretty long')
      }

      self._atomicFunctionQueue.push({
        nonAtomicPropertyName: nonAtomicPropertyName
      , args: args
      })

      self._processAtomicFunctionQueue()
    }
  }
, _processAtomicFunctionQueue: function _processAtomicFunctionQueue() {
    var self = this
      , func
      , oldCb
      , warningTimeout

    if(!this._atomicFunctionQueue.length || this._isRunningAtomicFunction)
      return

    func = this._atomicFunctionQueue.shift()
    oldCb = func.args.pop()

    if(typeof oldCb != 'function') {
      throw new Error('I can only make async functions atomic, so the last argument to ' + func.nonAtomicPropertyName + ' must be a callback function')
    }

    func.args.push(function () {
      clearTimeout(warningTimeout)
      self._isRunningAtomicFunction = false
      oldCb.apply(self, arguments)

      // Give other stuff some time to run..
      _.defer(function () {
        self._processAtomicFunctionQueue()
      })
    })

    this._isRunningAtomicFunction = Date.now()

    warningTimeout = setTimeout(function () {
      if(Date.now() - this._isRunningAtomicFunction > 10000 && this._atomicFunctionQueue.length)
        console.error('Warning: Possible circular dependency in atomic Universal-Collection function' +
                      ', a subsequent call has been waiting for over ten seconds')
    }, 10000)

    this[func.nonAtomicPropertyName].apply(this, func.args)
  }
, loaded: function (cb) {
    var self = this

    if(this._isLoading) {
      this._loadedCallbacks.push(cb)
    }
    else {
      _.defer(function () {
        self._execLoadedCallback(cb)
      })
    }
  }
  // Helper method
, _execLoadedCallback: function (cb) {
    if(this._loadedError) {
      cb.call(this, this._loadedError, null)
    }
    else {
      cb.call(this, null, this)
    }
  }
  // Called by the manager
, _finishedLoading: function (err) {
    var self = this
      , callbacks = this._loadedCallbacks

    // important incase of recursive sync execution in callbacks
    this._loadedCallbacks = []
    this._loadedError = err

    this._isLoading = false

    _.each(callbacks, function (cb) {
      self._execLoadedCallback(cb)
    })
  }
  // Override the default backbone fetch method
, fetch: function (cb) {
    this._isLoading = true
    this.options.manager.subscribe(this, _.omit(this.options, 'manager'))
    this.loaded(function () {
      cb()
    })
  }
, unsubscribe: function () {
    this.options.manager.unsubscribe(this)
  }
, setOptions: function (newOpts, cb) {
    if(this.options.manager.type != constants.TYPE_CLIENT) {
      throw new Error('Only client collections are permitted to change their options after initialization')
    }

    this._isLoading = true

    var oldOpts = _.omit(this.options, 'manager')
    this.options = _.extend({}, newOpts, {manager: this.options.manager})

    this.trigger('ucollection:change', this, oldOpts, _.omit(newOpts, 'manager'))

    this.loaded(cb)
  }
, destroy: function () {
    this.reset([])
    this.unsubscribe()
    this.stopListening()
    this.off()
  }
})

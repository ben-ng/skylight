var UniversalCollection = require('../')
  , PersonCollection

PersonCollection = UniversalCollection.extend({
  _id: 'PersonCollection'
, afterInit: function (opts) {
    opts = opts || {}

    if(opts.substring == null) { throw new Error('substring must be defined') }
  }
, _fetch: function (db, ctx, cb) {
    var self = this

    // Simulate network lag
    setTimeout(function () {
      if(self.options.substring === '') {
        return cb(new Error('Substring cannot be empty'))
      }

      // Filter to people with the substring we care about
      cb(null, db.filter(function (doc) {
        return doc.name && doc.name.indexOf(self.options.substring) > -1
      }))
    }, 0)
  }
})

module.exports = PersonCollection

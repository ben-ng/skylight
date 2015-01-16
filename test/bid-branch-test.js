var test = require('tape')
  , _ = require('lodash')
  , bootstrap = require('./bootstrap')
  , fixtures = []
  , instance
  , serverCouch
  , clientManager
  , serverManager

// Config for this test
  , context = {user: {_id: 'user:chris', name: 'Biker Dude'}}
  , ItemBidBranch = require('../../collections/universal-collections/item-bid-branch')
  , mockedViewResponse = []
  , MockedItemBidBranch = ItemBidBranch.extend({
      _fetch: function (blah, ctx, cb) {
        setTimeout(function () {
          cb(null, mockedViewResponse)
        }, 0)
      }
    })
  , manifest = {ItemBidBranch: MockedItemBidBranch}

// Fixtures
  , item
  , bid1
  , bid2
  , supplier1
  , supplier2

item = {
  _id: 'item:buffalo'
, type: 'item'
, requestedTime: new Date().getTime()
, duration: 60*1000*24
}

bid1 = {
  _id: 'bid:bid-1'
, item: 'item:buffalo'
, type: 'bid'
, supplier: 'branch:supplier-1'
}

bid2 = {
  _id: 'bid:bid-2'
, item: 'item:buffalo'
, type: 'bid'
, supplier: 'branch:supplier-2'
}

supplier1 = {
  _id: 'branch:supplier-1'
, type: 'branch'
}

supplier2 = {
  _id: 'branch:supplier-2'
, type: 'branch'
}

mockedViewResponse.push({
  _id: 'bidbranch:bid-1'
, type: 'bidbranch-buffalo'
, bid: _.cloneDeep(bid1)
, supplier: _.cloneDeep(supplier1)
})

fixtures.push.apply(fixtures, [item, bid1, supplier1, supplier2])

instance = bootstrap(fixtures, context, manifest)
clientManager = instance.clientManager
serverManager = instance.serverManager
serverCouch = instance.serverCouch

test('ItemBidBranch Collection', function (t) {

  t.plan(3)

  serverManager.once('send', function (doc) {
    // Should send down the one bidbranch model
    t.equal(doc._id, 'bidbranch:bid-1')

    serverManager.once('send', function (doc) {
      // Should send down the second bidbranch model
      t.deepEqual(doc, {
        _id: 'bidbranch:bid-2'
      , type: 'bidbranch-buffalo'
      , bid: _.cloneDeep(bid2)
      , branch: _.cloneDeep(supplier2)
      })

      serverManager.once('delete', function (doc) {
        // Should send down the second bidbranch model
        t.deepEqual(doc, {
          _id: 'bidbranch:bid-2'
        , type: 'bidbranch-buffalo'
        , bid: _.cloneDeep(bid2)
        , branch: _.cloneDeep(supplier2)
        , _deleted: true
        })
      })

      bid2.cancelled = true

      serverCouch.save(bid2)
    })

    serverCouch.save(bid2)
  })

  var clientCollection = new MockedItemBidBranch(null
    , {manager: clientManager, item: item})
})

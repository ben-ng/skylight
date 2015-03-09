var test = require('tape')
  , _ = require('lodash')
  , bootstrap = require('./bootstrap')
  , instance
  , serverCouch
  , clientManager
  , serverManager
  , PersonCollection = require('./person-collection')
  , AggregateCollection = require('./aggregate-collection')
  , managerContext = {user: {_id: 'user:fred', name: 'Kanye West'}}
  , managerManifest = {PersonCollection: PersonCollection, AggregateCollection: AggregateCollection}
  , dan = {_id: 'user:dan', name: 'Techwraith'}
  , chris = {_id: 'user:chris', name: 'Namespace Jargonaut'}
  , joey = {_id: 'user:joey', name: 'Master Of Time'}
  , jon = {_id: 'user:jon', name: 'Creator of Semicolons'}
  , cristi = {_id: 'user:cristi', name: 'Queen of Sushirrito'}
  , kevin = {_id: 'user:kevin', name: 'Kickass Bostoner'}
  , fakeFixtures = [dan, chris, joey]
  , couchFeed
  , emitted = false
  , resetEmitted = function () {
      emitted = false
      couchFeed.once('row', function (row) {
        emitted = row.doc
      })
    }
  , bikerCollection
  , kickassPeople
  , cowboys

instance = bootstrap(fakeFixtures, managerContext, managerManifest)
clientManager = instance.clientManager
serverManager = instance.serverManager
serverCouch = instance.serverCouch
couchFeed = serverCouch.getFeed()

test('universal-collection:mocks', function (t) {
  t.plan(12)

  // The properties should be the same
  t.deepEqual(serverCouch.get('user:dan'), dan, 'Should have been initialized with Dan')
  t.deepEqual(serverCouch.get('user:chris'), chris, 'Should have been initialized with Chris')
  t.deepEqual(serverCouch.get('user:joey'), joey, 'Should have been initialized with Joey')

  // But the objects should have been cloned
  t.notStrictEqual(serverCouch.get('user:dan'), dan, 'Should have been initialized with a cloned Dan')
  t.notStrictEqual(serverCouch.get('user:chris'), chris, 'Should have been initialized with a cloned Chris')
  t.notStrictEqual(serverCouch.get('user:joey'), joey, 'Should have been initialized with a cloned Joey')

  // Try changing chris and saving him
  chris.name = 'Destroyer of Semicolons'
  t.notEqual(serverCouch.get('user:chris').name, chris.name, 'Name should not have changed yet')

  // We want to check if the couchfeed mock is emitting correctly
  resetEmitted()
  serverCouch.save(chris)

  // Check if the save worked
  t.equal(serverCouch.get('user:chris').name, chris.name, 'Name should have changed')
  t.deepEqual(emitted, chris, 'Changed doc should have been emitted')
  t.notStrictEqual(emitted, chris, 'A cloned changed doc should have been emitted')

  // Through all this, the model caches should still be empty since no collections were subscribed to
  t.equal(serverManager.subscriptionCount(), 0, 'Server model cache should be empty')
  t.equal(clientManager.subscriptionCount(), 0, 'Client model cache should be empty')
})

test('universal-collection:subscribing from client', function (t) {
  t.plan(17)

  // Now, initialize a collection on the client side
  clientManager.once('subscribe', function (id, opts) {
    t.equal(id, 'PersonCollection', 'Client model cache should have emitted `subscribe` with the collection ID')
    t.deepEqual(opts, {substring: 'Semicolons'}, 'Client model cache should have emitted `subscribe` with the collection options')
  })

  serverManager.once('subscribed', function (err, id, opts) {
    t.ifError(err, 'Server model cache should have subscribed without errors')
    t.equal(id, 'PersonCollection', 'Server model cache should have emitted `subscribed` with the collection ID')
    t.deepEqual(opts, {substring: 'Semicolons'}, 'Server model cache should have emitted `subscribe` with the collection options')
  })

  serverManager.once('send', function (identifier, doc) {
    t.equal(identifier, 'bfc5b1764111fe45099d523036e0709f', 'identifier should match')
    t.deepEqual(doc, {_id: 'user:chris', name: 'Destroyer of Semicolons'}, 'Should have sent the matching Chris doc')
    t.equal(bikerCollection.length, 1, 'There should be one doc in the client')

    // Now save something to couch that matches the condition, and see if it got sent to the client
    serverManager.once('send', function (identifier, doc) {
      t.equal(identifier, 'bfc5b1764111fe45099d523036e0709f', 'identifier should match')
      t.deepEqual(doc, jon, 'Should have sent the matching Jon doc')
      t.equal(bikerCollection.length, 2, 'There should be two docs in the client')

      // And then save something to couch that does not match the condition. nothing should happen!
      serverCouch.save(cristi)

      // Now change a model so it gets removed from the collection
      serverManager.once('delete', function (identifier, doc) {
        t.equal(identifier, 'bfc5b1764111fe45099d523036e0709f', 'identifier should match')
        t.deepEqual(doc, { _deleted: true, _id: 'user:jon' }, 'Should have removed the matching Jon doc')
        t.equal(bikerCollection.length, 1, 'There should be one doc in the client')

        bikerCollection.loaded(function () {
          bikerCollection.destroy()

          t.equal(serverManager.subscriptionCount(), 0, 'Should have unsubscribed the collection')
          t.equal(clientManager.subscriptionCount(), 0, 'Should have unsubscribed the collection')
          t.equal(bikerCollection.length, 0, 'There should be no docs in the client')
        })
      })

      jon.name = 'Gatekeeper of Destiny'
      serverCouch.save(jon)
    })

    serverCouch.save(jon)
  })

  bikerCollection = new PersonCollection(null, {manager: clientManager, substring: 'Semicolons'})
})

test('universal-collection:correctness of multiple collections', function (t) {
  /*
  * We create two collections, one with chris and jon, the other with dan and jon
  * then we update jon such that he only exists in the first collection
  * and we update dan such that he no longer exists in any collection
  * and we insert kevin so that he exists in the second collection
  * we expect to see:
  * send: jon
  * delete: dan
  * send: kevin
  */

  t.plan(9)

  var count = 0
    ,  finishListener

  dan.name = 'Console Cowboy'
  jon.name = 'Kickass Cowboy'
  chris.name = 'Kickass Biker'

  serverCouch.save(dan)
  serverCouch.save(jon)
  serverCouch.save(chris)

  serverManager.on('send', function sendListener () {
    count++

    if(count === 4) {
      t.equal(kickassPeople.length, 2, 'There are two kickass people')
      t.equal(cowboys.length, 2, 'There are two cowboys')
      count = 0

      finishListener = function () {
        count = count + 1

        if(count == 3) {
          t.equal(cowboys.length, 1, 'There is one cowboy')
          t.equal(kickassPeople.length, 2, 'There are two kickass people')
          t.ok(cowboys.find(function (t) {return t.id == 'user:jon'}), 'Jon is a cowboy')
          t.ok(kickassPeople.find(function (t) {return t.id == 'user:kevin'}), 'Kevin is a kickass')
          t.ok(kickassPeople.find(function (t) {return t.id == 'user:chris'}), 'Chris is a kickass')

          serverManager.removeListener('send', finishListener)
          serverManager.removeListener('delete', finishListener)

          serverManager.once('delete', function (identifier, doc) {
            t.equal(identifier, 'ca48e01ce89ae01819dbded9ac77b3fc', 'identifier should match')
            t.deepEqual(doc, { _deleted: true, _id: 'user:chris' }, 'Should delete the chris doc')

            kickassPeople.loaded(function () {
              this.destroy()
            })
            cowboys.loaded(function () {
              this.destroy()
            })
          })

          chris._deleted = true

          serverCouch.save(chris)
        }
      }

      serverManager.removeListener('send', sendListener)
      serverManager.on('send', finishListener)
      serverManager.on('delete', finishListener)

      jon.name = 'English Cowboy'
      dan.name = 'Nomad War-Roomer'

      serverCouch.save(jon)
      serverCouch.save(dan)
      serverCouch.save(kevin)
    }
  })

  kickassPeople = new PersonCollection(null, {manager: clientManager, substring: 'Kickass'})
  cowboys = new PersonCollection(null, {manager: clientManager, substring: 'Cowboy'})
})

test('universal-collection: aggregate collections', function (t) {
  var testCollection

  t.plan(9)

  serverManager.once('send', function (identifier, doc) {
    t.equal(identifier, '6c72e2838f5b87944bf6c1a3b961f33e', 'identifier should match')
    t.deepEqual(doc, { members: [ 'user:jon' ], type: 'aggr', _id: 'aggr:Cowboy' }, 'Jon should be the only cowboy')

    serverManager.once('send', function (identifier, doc) {
      t.equal(identifier, '6c72e2838f5b87944bf6c1a3b961f33e', 'identifier should match')
      t.deepEqual(doc, { members: [ 'user:chris', 'user:kevin' ], type: 'aggr', _id: 'aggr:Kickass' }, 'Kev and Chris should be kickass')

      // Try out the onChange method. This should take kevin out of the kickass group.
      serverManager.once('send', function (identifier, doc) {
        t.equal(identifier, '6c72e2838f5b87944bf6c1a3b961f33e', 'identifier should match')
        t.deepEqual(doc, { members: [ 'user:chris' ], type: 'aggr', _id: 'aggr:Kickass' }, 'Kevin should no longer be kickass')

        serverManager.once('delete', function (identifier, doc) {
          t.equal(identifier, '6c72e2838f5b87944bf6c1a3b961f33e', 'identifier should match')
          t.deepEqual(doc, {_deleted: true, _id: 'aggr:Kickass'}, 'The Kickass derived model should have been deleted')

          testCollection.loaded(function () {
            testCollection.destroy()
            t.ok(true, 'cleanup')
          })
        })

        // Now take chris out too. See if the entire derived model gets nuked
        chris.name = 'Portland Dude'
        serverCouch.save(chris)
      })

      kevin.name = 'Straight Outta Boston'
      serverCouch.save(kevin)
    })
  })

  testCollection = new AggregateCollection(null, {manager: clientManager, substrings: ['Cowboy', 'Kickass']})
})

test('universal-collection: changing options of an existing collection', function (t) {
  var testCollection

  t.plan(7)

  serverManager.once('send', function (identifier, doc) {
    t.equal(identifier, '723e32c16c4ec565b0313c3fdd6dcba9', 'identifier should match')
    t.deepEqual(doc, { members: [ 'user:jon' ], type: 'aggr', _id: 'aggr:Cowboy' }, 'Jon should be the only cowboy')

    serverManager.once('delete', function (identifier, doc) {
      t.equal(identifier, '723e32c16c4ec565b0313c3fdd6dcba9', 'identifier should match')
      t.deepEqual(doc, {_id: 'aggr:Cowboy', _deleted: true}, 'The Cowboy derived model should have been deleted')
    })

    serverManager.once('send', function (identifier, doc) {
      t.equal(identifier, '723e32c16c4ec565b0313c3fdd6dcba9', 'identifier should match')
      t.deepEqual(doc, { members: [ 'user:chris' ], type: 'aggr', _id: 'aggr:Portland' }, 'Chris should be Portland')
    })

    testCollection.setOptions({substrings: ['Portland']}, function () {
      testCollection.destroy()
      t.ok(true, 'cleanup')
    })
  })

  testCollection = new AggregateCollection(null, {manager: clientManager, substrings: ['Cowboy']})
})

test('universal-collection: loaded callback when successful', function (t) {
  var testCollection
    , finish = _.after(2, function () {
        testCollection.loaded(function () {
          this.destroy()
          t.ok(true, 'cleanup')
        })
      })

  t.plan(9)

  testCollection = new PersonCollection(null, {manager: clientManager, substring: ['d']})

  testCollection.loaded(function (err, self) {
    t.ifError(err)
    t.ok(true, 'first loaded callback')
    t.strictEqual(this, testCollection, 'this is bound correctly')
    t.strictEqual(self, testCollection, 'self is the same collection')
    finish()
  })

  testCollection.loaded(function (err, self) {
    t.ifError(err)
    t.ok(true, 'second loaded callback')
    t.strictEqual(this, testCollection, 'this is bound correctly')
    t.strictEqual(self, testCollection, 'self is the same collection')
    finish()
  })
})

test('universal-collection: loaded callback when unsuccessful', function (t) {
  var testCollection
    , finish = _.after(2, function () {
        testCollection.loaded(function () {
          this.destroy()
          t.ok(true, 'cleanup')
        })
      })

  t.plan(5)

  testCollection = new PersonCollection(null, {manager: clientManager, substring: ''})

  testCollection.loaded(function (err) {
    t.equal(err.toString(), 'Error: Substring cannot be empty')
    t.ok(true, 'first loaded callback')
    finish()
  })

  testCollection.loaded(function (err) {
    t.equal(err.toString(), 'Error: Substring cannot be empty')
    t.ok(true, 'second loaded callback')
    finish()
  })
})

test('universal-collection: loaded callback when option change unsuccessful', function (t) {
  var testCollection

  t.plan(5)

  testCollection = new PersonCollection(null, {manager: clientManager, substring: 'd'})
  testCollection.debug = 'blah'

  testCollection.loaded(function (err) {
    t.ifError(err)
    t.ok(true, 'first loaded callback')

    testCollection.setOptions({substring: ''}, function (err) {
      t.equal(err.toString(), 'Error: Substring cannot be empty')
      t.ok(true, 'second loaded callback')
      testCollection.destroy()
      t.ok(true, 'cleanup')
    })
  })
})

test('universal-collection: reconnect', function (t) {
  t.plan(2)

  var testCollection = new PersonCollection(null, {manager: clientManager, substring: 'd'})

  testCollection.loaded(function () {
    clientManager.once('subscribe', function () {
      t.ok('reconnect caused the subscribe event to be sent again')

      testCollection.loaded(function () {
        this.destroy()
        t.ok(true, 'cleanup')
      })
    })

    clientManager.resubscribe()
  })
})

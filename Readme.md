# Skylight

The (Experimental!) Skylight library simplifies the construction of real-time collections.

[![Build Status](https://travis-ci.org/ben-ng/skylight.png?branch=master)](https://travis-ci.org/ben-ng/skylight)

## Core Values

Real-time collections are difficult to do well unless you have your priorities set straight.

In order of importance, here are the goals of Skylight:

1. Correctness

    Skylight is a thin but bulletproof interface between your database and client.

2. Simplicity

    Simplicity allows consumers of Skylight to create understandable and well behaved collections.

3. Performance

    Without compromising on correctness or simplicity, Skylight is *fast*.

## Nomenclature

The `Skylight` class is an extension of `Backbone.Collection`. Think of `Skylight` as a window into your data -- you can see your data, but you can't change it. Whereas normal Backbone collections change when you call methods like `add` and `sync`, `Skylight` collections only change when your database changes.

A pair of Manager instances are required. One goes on the server, and the other on the client. They are named `ServerManager` and `ClientManager` respectively. The job of the Managers is to bridge the communication gap between server and client.

## API

### ServerManager

The `ServerManager` requires more parameters than the `ClientManger` because it has to communicate with your database.

```js
var serverManager = new ServerManager(
    {
      // Passed directly to your collections to use. Backend Agnostic!
      db: db

      // Must be an EventEmitter that emits 'change' events
      // when a record changes, passing the record as the first argument
    , dbFeed: feed

      // Passed directly to your collections to use, useful for storing user
      // roles and permissions so you can use them in filters
    , context: context

      // A map of Skylight collections like:
      // {CustomCollection: require('./collections/custom')}
    , manifest: manifest
    })

// Socket must be an EventEmitter that emits ClientManager events
serverManager.setClientFeed(socket)
```

### ClientManager

The `ClientManager` is simple to set up because it simply reflects what the `ServerManager` sees on the server.

```js

var clientManager = new ClientManager(
    {
      // Socket must be an EventEmitter that emits ServerManager events
      serverFeed: socket
    })

```

#### Instance Methods

##### ClientManager.create(CollectionConstructor, optionsObject)

The `create` method returns a collection with the specified options. If a duplicate collection already exists, you will get an identical instance. Otherwise, a new instance will be returned.

```js
var myInstance = clientManager.create(MyCollection, {option: 'a'})
```

### Skylight

`Skylight` uses progressive enhancement to give users some control over how simple or performant they want their collections to be.

#### The Minimum Collection

`Skylight` subclasses require at minimum:

1. An `_id` property that uniquely identifies this type of collection
2. A `_fetch` method that gets the data for the collection

```js
Skylight.extend({
  _id: 'Users'

, _fetch: function (db, context, cb) {

    // `Skylight` does not care what db adapter or backend you use
    // (the db object is whatever you constructed the `ServerManager` with)
    db.query('SELECT * FROM `users`', function (err, data) {

      // If nothing went wrong, call cb with an array of plain objects
      if(err)
        return cb(err)
      else
        return cb(null, data)

    })
  }
})
```

I was verbose with the above example so I could explain the data that the `_fetch` callback expects. In reality, your simplest collections would look similar to this:

```js
Skylight.extend({
  _id: 'Users'
, _fetch: function (db, context, cb) {
    db.query('SELECT * FROM `users`', cb)
  }
})
```

#### Incremental Updates

Instead of performing a fetch for every change, you can implement an optional `_onChange` method that is called each time the `ServerManager`'s `dbFeed` emits a `change` event.

You can get very creative with your `_onChange` method, but here is a typical one that has logic for adding, editing, and removing models.

```js
Skylight.extend({
  _id: 'Users'

, _fetch: function (db, context, cb) {
    db.query('SELECT * FROM `users`', cb)
  }

  // `doc` is the `dbFeed` `change` event's first argument
  // here we'll assume that `doc` is a plain object like {id: 'joe', type: 'user'}
, _onChange: function (doc, db, context, cb) {

    // Find an existing model with this id
    var existing = this.get(doc.id)

    // If the document is already in the collection
    if(existing != null) {

      // If the document is deleted, remove it
      if(doc.deleted) {
        this.remove(existing)
      }
      // Otherwise, update the model's attributes
      else {
        existing.set(doc)
      }

    }
    // If the document is not already in the collection, add it if it belongs
    else if(existing.type == 'user') {
      this.add(doc)
    }

    // When done manipulating the collection, call `cb` to flush changes
    cb()
  }
})
```

Take a little time to understand the annotated example above. The `_onChange` method is a powerful and unopinionated way to perform incremental updates -- even asynchronous ones!

Since incremental updates are inherently more tricky to get right, here is the above example without the annotations so that you can use it as a template:

```js
Skylight.extend({
  _id: 'Users'

, _fetch: function (db, context, cb) {
    db.query('SELECT * FROM `users`', cb)
  }

, _onChange: function (doc, db, context, cb) {
    var existing = this.get(doc.id)

    if(existing != null) {
      if(doc.deleted)
        this.remove(existing)
      else
        existing.set(doc)
    }
    else if(doc.type == 'user') {
      this.add(doc)
    }

    cb()
  }
})
```

#### Instance Methods

##### Skylight.loaded

The loaded method calls the callback when the collection is done retrieving its initial payload.

```js
instance.loaded(function (err, inst) {
  // err is an Error if there was a problem
  // inst is the collection instance that loaded. in this case, thats `instance`.
})
```

##### Skylight.setOptions

This method allows you to change the options of a collection on-the-fly. The callback is called after the options have been set, and the new data has loaded.

```js
instance.setOptions({}, function (err, inst) {
  // err is an Error if there was a problem
  // inst is the collection instance that finished loading. in this case, thats `instance`.
})
```

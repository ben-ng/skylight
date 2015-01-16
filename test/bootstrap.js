module.exports = function (fixtures, context, manifest) {
  var ServerManager = require('../manager/server')
    , ClientManager = require('../manager/client')
    , FakeCouch = require('./fake-couch')
    , serverCouch = new FakeCouch(fixtures)
    , couchFeed = serverCouch.getFeed()
    , serverManager = new ServerManager(
      {
        db: serverCouch
      , dbFeed: couchFeed
      , context: context
      , manifest: manifest
      })
      // OK to use the server MC as the serverFeed because the 'send' and 'delete' events are the same
      // as what would happen through RT. In real use, you would use RT instead.
    , clientManager = new ClientManager({serverFeed: serverManager, context: context})

  serverManager.setClientFeed(clientManager)

  return {
    serverManager: serverManager
  , clientManager: clientManager
  , serverCouch: serverCouch
  }
}

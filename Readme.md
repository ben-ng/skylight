# Skylight

Still Experimental.

[![Build Status](https://travis-ci.org/ben-ng/skylight.png?branch=master)](https://travis-ci.org/ben-ng/skylight)

## Philosophy

The Skylight library simplifies the construction of real-time Backbone Collections. These collections provide a view of the data you care about as it changes.

## Typical Architecture

```text

CouchDB
|
couchwatch (or other database watcher)
|
v             (belongs/fetch) Collection
Skylight    ->(belongs/fetch) Collection  On the server side, Skylight responds to subscriptions from the client
^             (belongs/fetch) Collection  by creating collections and using them to fetch data from the db
|
socket.io (or whatever)
|
v           <- (belongs) Collection
Skylight    <- (belongs) Collection  The client's Skylight simply mirrors its counterpart on the server
            <- (belongs) Collection  and collections keep themselves up to date by subscribing to it

```

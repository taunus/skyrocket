# skyrocket

> Seamlessly upgrade Taunus applications to a realtime festivus

Intended for use after you've set up Taunus and [gradual][1] along with it.

# Motivation

Skyrocket sets you up to do realtime with Taunus without radically changing your application and while staying on the progressive enhancement course. Think of `skyrocket` as the data-binding aspect of Taunus. Instead of spending most of your time on getting data-binding right, you'll be spending time on getting realtime updates right.

These updates are one-way (model to view). Model-to-view is effective because any impact you have on the view should ultimately persist changes on the server, which should end up triggering a skyrocket back to your client _(and other interested parties)_, which will in turn update the view with those model changes.

# Requirements

- Taunus
- WebSockets _(we suggest [socket.io][2] but you can use anything)_

# Install

```shell
npm install skyrocket --save
```

# Setup

There's a little configuration to be done around `skyrocket` mostly so that it stays transport and authentication agnostic. I'll explain how you can set up `skyrocket` naïvely and try to explain along the way where you might want to reinforce your application.

We'll need:

- A server-side WebSocket endpoint to listen for events
- A server-side WebSocket endpoint to stop listening for an events
- A client-side WebSocket endpoint to handle any updates

Here's both of the server-side endpoints that let a user join and leave rooms at will. In the real world you should probably verify the user is authorized to join a given room. This is entirely left up to you. You are also completely free when it comes to the endpoints you want to use.

```js
server.on('connection', connected);

function connected (socket) {
  socket.on('/skyrocket/join', join);
  socket.on('/skyrocket/leave', leave);

  function join (data) {
    data.rooms.forEach(socket.join);
  }
  function leave (data) {
    data.rooms.forEach(socket.leave);
  }
}
```

On the client-side, you'll need to tell `skyrocket` to use these endpoints to join and leave channels _("rooms" in [socket.io][2] terminology)_. The `revolve` method gets called with the `type` of action `skyrocket` needs to perform _(`join` or `leave`)_, and the `rooms` that need to be entered or abandoned. Keep in mind, it's up to the server to grant or revoke access to any given room.

```js
var client = require('socket.io-client');
var io = client('');
var gradual = require('gradual');
var skyrocket = require('skyrocket');

skyrocket.configure({
  revolve: revolve
});

function revolve (type, rooms) {
  io.emit('/skyrocket/' + type, { rooms: rooms });
}
```

Lastly, you'll want to set up `skyrocket.react` handlers whenever a [gradual][1] response comes in, and also whenever a realtime payload is received. Again, the `/skyrocket/update` endpoint could also be changed to some other route of your choosing.

```js
gradual.on('data', skyrocket.react);
io.on('/skyrocket/update', skyrocket.react);
```

# Usage

Now that the `skyrocket` is armed, you can send updates from the server-side to all relevant clients. Typically, you'll want to respond on an HTTP request with the payload, and send the same update to all listeners in the room.

Here's a _(simplified)_ example where a card was moved in a Stompflow sprint board. This update doesn't do anything, but we'll get to more meaningful updates, and their schema, in just a bit.

```js
var room = '/stompflow/stompflow/sprints/1/move';
var data = {
  updates: [{
    rooms: [room]
  }]
};
res.json(data);
socket.to(room).emit('/skyrocket/update', data);
```

Only clients who are actually in that room will get the update, along with the recipient of the JSON response.

We haven't yet gotten to what the update looks like, or how it gets handled on the client-side, but note how we're able to treat responses exactly the same as realtime updates? This means that **your data-binding efforts will effectively lay out most of the groundwork for realtime interactions** in your Taunus applications.

## Skyrocket Schema

Before we get to how you'll handle these _"updates"_, we need to look into how they look like and how they work. Updates get applied against a view model or a portion of a view model. At their most basic, consider the update shown below.

```js
{
  updates: [{
    rooms: ['/stompflow/stompflow'],
    model: {
      description: 'Hazelnuts!',
      foo: {
        bar: 'baz'
      }
    }
  }]
}
```

This update gets applied against a model using [assignment][3], replacing whatever `description` value with `'Hazelnuts!'`. If `model.foo` already existed, then only `model.foo.bar` would be changed to `'baz'`, and the rest of that tree will stay intact. This makes it easy to update bits of a model without compromising the rest, and without demanding that you send the whole model through the wire every single time a value changes.

### Operations

Arrays are a little different because many times we want to remove a specific item, add something to the end of the collection, or maybe even add something to the beginning. Sometimes we just want to edit an item! To get around all of these, `skyrocket` has the concept of _operations_.

Suppose you had a view model like this:

```js
{
  thread: {
    comments: [{
      id: 1,
      author: 'bevacqua',
      text: 'this seems pretty verbose'
    }, {
      id: 2,
      author: 'BUYSELLSHOES.COM',
      text: 'SHOES ARE THE BEST. BUY BUY BUY, offers. prada! nike!'
    }]
  }
}
```

If for some reason you wanted to submit an update indicating that the second comment should be deleted, the following would suffice. Note how the `concern` property is used to figure out what it is that should be updated, and `op` indicates we want to remove an element from the collection. Similarly, `query` indicates what it is we want removed.

```js
{
  updates: [{
    rooms: ['/stompflow/stompflow'],
    operations: [{
      concern: 'thread.comments',
      op: 'remove',
      query: { id: 2 }
    }]
  }]
}
```

Want to add another comment instead? Just use the `push` operation, this time we'll have to add the model as well, but we don't need a `query`. You could also use `unshift` if you want the element at the beginning of the list instead.

```js
{
  updates: [{
    rooms: ['/stompflow/stompflow'],
    operations: [{
      op: 'push',
      concern: 'thread.comments',
      model: {
        id: 3,
        author: 'hackernewsexpert',
        text: 'Shoes are not that useful. Research shows sandals are better.'
      }
    }]
  }]
}
```

Lastly, editing a comment is just as easy.

```js
{
  updates: [{
    rooms: ['/stompflow/stompflow'],
    operations: [{
      concern: 'thread.comments',
      op: 'edit',
      query: { id: 3 },
      model: {
        text: 'Shoes are terrible. Big data shows sandals are way better.'
      }
    }]
  }]
}
```

Whenever the straightforward `model` updates or the array `operations` aren't enough, you can resort to a custom `applyChanges` option in the view controller. How is it that you can actually update a view model using all of this, then?

Consider the case where you have a timeline thread that can be watched for notifications. When the button gets clicked the action changes from Watch to Unwatch, or viceversa. As you can see here, the changes to the `viewModel` are entirely conducted by `skyrocket`, and your view controller can focus on re-rendering the relevant portion of the view. Effectively, this is one-way data-binding from your model to your view.

```js
var taunus = require('taunus');
var skyrocket = require('skyrocket');

module.exports = function timelineController (viewModel, container, route) {
  var rocket = skyrocket.scope(container, viewModel);

  rocket.on(route.pathname + '/timeline/watch-unwatch', onchange);

  function onchange () {
    taunus.partial($.findOne('.tl-watch-actions'), 'projects/timeline/watch-unwatch', viewModel);
  }
};
```

You do have to break up the views in as many small components as you deem necessary, but modularity is hardly a bad thing.

# API

The `skyrocket` API comes with a few distinct methods.

## `skyrocket.configure(options)`

The `options` that you can pass to this method are:

- `revolve(type, rooms)`, a method that will be invoked whenever Skyrocket needs to join or leave a room via WebSocket
- `joining(reactor)`, a method that will be invoked whenever entering a room on the client-side

The `reactor` object contains all sorts of relevant pieces.

- `container` is the DOM element passed to `skyrocket.scope` when setting up the listening context
- `viewModel` is the model passed to `skyrocket.scope` when setting up the listening context
- `room` is the room this `reactor` is listening on
- `applyChanges` is the method with which updates to the `viewModel` will be applied
- `reaction` is the method that will get called after changes get applied
- `destroy` should be invoked whenever the `reactor` is deemed no longer necessary

## `skyrocket.scope(container, viewModel)`

Typically invoked once per view controller, this method returns a `rocket` object that's able to listen in on rooms.

#### `rocket.on(room, options?, reaction)`

Whenever `room` gets an update, applies changes to `viewModel` and fires `reaction(update)`. The `options` object may be omitted. Options include:

- `applyChanges(viewModel, update)` is meant to apply an `update` to a `viewModel`. Advanced, shouldn't be necessary in most use cases

## `skyrocket.react(data)`

For the most part this should be wired as explained at the end of the [setup](#setup) section. This method is used to signal an incoming event that should be handled to update any relevant view models and re-render affected parts of a view.

# License

MIT

[1]: https://github.com/taunus/gradual
[2]: https://socket.io
[3]: https://github.com/bevacqua/assignment

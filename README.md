# Easy Peasy Database

Short: ezpzdb


Easy to use, lightweight and standalone database
management system for Node

**IMPORTANT:** Please do not use this in production, yet.
It has not been tested on the long run and could still have bugs.
Consider this as a WIP until this notice is removed.
Of course you are welcome to test this out on the long run
and give feedback on it.

### How to use this?

First add it to your node modules.
Since it hasn't been released on npm and you added it manually,
do this:

```
cd node_modules/ezpzdb
yarn install
cd ../..
```

You can also use npm, whatever you like.

Now an example:

```javascript
// Create a database instance
// It does not exist on disk, yet.
// It will be created on disk as soon as data is saved
// When data is saved is determined by the database system
// but can be customized by passing additional parameters.
const db = require('ezpzdb').db('database')

// That's it. Use it.
db.insert('database', {
    firstname: 'Nodey',
    name: 'McNodeFace',
    street: '9 Node St',
    city: 'Node Town',
    country: 'Nodeland'
}) // returns ID
db.get('database', 1) // returns the object
db.update('database', {
    id: 1,
    name: 'McNotSoNodeFace'
}) // returns true on success
db.insert('database' { somethingDifferent: 2 }) // returns ID 2
db.remove('database', 1) // returns true on success
// Removes everything where the ID is bigger than 0
// Inserts after this have the ID of 1 (because 0 + 1 = 1, quick maffs)
db.truncate('database', 0) // returns true on success
```

When your Node process is about to exit (e. g. SIGTERM), then
ezpzdb is automatically going to save data to disk and shut
down gracefully. Note, that if you also have such handlers,
make sure you register them BEFORE you initialize a database instance
and don't exit from them because ezpzdb will do that for you.
You will risk data loss if you don't follow those rules.

This database system works in a lazy way - data is only saved
when it thinks it's time to save them - it works kind of like
a garbage collector. Thus, if you don't let it save the data before
exiting, you will lose the data that has not been saved yet.

There is also a cache: when you get something, it is cached in
memory. How long it is kept in the cache depends on how often and
how frequently you access it. That means that if you don't get the
same entry often enough, it will be removed from the cache and hence
will read it from disk the next time it is requested (and is then stored
in the cache again).

The cache **won't** be stored on disk and thus will be gone when
the process exits.

### License

This module is licensed under the MIT license.

```
MIT License

Copyright (c) 2018 Simão Gomes Viana

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

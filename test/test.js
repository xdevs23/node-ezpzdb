'use strict'

const assert = require('assert')
const ezpzdb = require('../.')

describe('db', () => {
  var db
  it('creating a database instance', () => {
    db = ezpzdb.db('testdb')
    it('should not be falsey', () => {
      assert(typeof db === 'object')
    });
  });
  it('inserting the first item', () => {
    let id = db.insert('testtable', {
      someNumber: 3.141,
      someString: 'I am a string',
      someBool: true,
      someObject: {
        anotherNumber: 4.0,
        anotherString: 'I am another string'
      },
      someArray: [0, 1, 2, 'str', 3.2, {}, [1, 2]],
      goodString: 'good'
    })
    assert.equal(id, 1, `ID should be 1 but got ${id}`)
  })
  it('getting the first item', () => {
    let item = db.get('testtable', 1)
    assert.equal(item.someNumber, 3.141)
    assert.equal(item.someBool, true)
    assert(typeof item.doesNotExist === 'undefined')
  })
  it('deleting the first item', () => {
    assert(db.remove('testtable', 1))
    assert(!db.get('testtable', 1))
  })
  it('adding another item', () => {
    assert(db.insert('testtable', { someNumber: 7 }), 2)
  })
  it('getting the second item', () => {
    let item = db.get('testtable', 2)
    assert.equal(item.someNumber, 7)
    assert(typeof item.doesNotExist === 'undefined')
  })
  it('truncating the table', () => {
    db.truncate('testtable', 0)
      assert.equal(db.getAll('testtable').length, 0)
      assert.equal(db.insert('testtable', { someNumber: 16.667 }), 1)

      assert.equal(db.insert('testtable', {
        someNumber: 33.333,
        someString: 'h4x'
      }), 2)

      assert.equal(db.insert('testtable', { someNumber: 66.667 }), 3)

      assert.equal(db.get('testtable', 1).someNumber, 16.667)
  })
  it('updating item 2', () => {
    db.update('testtable', {
      id: 2,
      someNumber: 20.8,
      anotherString: 'y35'
    })
    let item = db.get('testtable', 2)
    assert.equal(item.someNumber, 20.8)

    item = db.get('testtable', 2)
    assert.equal(item.anotherString, 'y35')

    item = db.get('testtable', 2)
    assert.equal(item.someString, 'h4x')
  })
  it('removing item 1', () => {
    db.remove('testtable', 1)
    assert(!db.get('testtable', 1))
    assert.equal(db.insert('testtable', { someNumber: 3 }), 4)
  })
  it('graceful shutdown', () => {
    db.gracefulShutdown()
  })
});

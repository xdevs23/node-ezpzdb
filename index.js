'use strict'

const Database = require('./db/db.js')

module.exports = {
  db (path) {
    return new Database(path)
  }
}

'use strict'

const mkdir = require('mkdir-p')
const fs = require('fs')
var util = null

function throwAndLog(msg) {
  console.error(msg)
  throw Error(msg)
}

function appendFile(file) {
  log("Persisting data...")
  let stream = fs.createWriteStream(file, { flags: 'a' })
  return {
    append (content) {
      stream.write(content)
    },
    async close () {
      stream.end()
      log("...done")
    }
  }
}

function log(msg) {
  console.log(`[ezpzdb] ${msg}`)
  return msg
}

function logi(obj) {
  if (util === null) util = require('util')
  return log(util.inspect(obj))
}

function readFilePartialSync (filename, start, length) {
  var buf = new Buffer(length)
  var fd = fs.openSync(filename, 'r')
  fs.readSync(fd, buf, 0, length, start)
  fs.closeSync(fd)
  return buf
}

class Database {

  constructor (dir) {
    let thiz = this
    this.storage = {
      tables: {

      },
      dir,
      exists: false
    }
    this.index = {
      tables: {}
    }
    this.paths = {
      tabledir (table) {
        return `${thiz.storage.dir}/tables/${table}`
      },
      indexfile (table) {
        return `${thiz.paths.tabledir(table)}/index`
      },
      tablefile (table) {
        return `${thiz.paths.tabledir(table)}/db`
      }
    }
    this.initialize()
  }

  initialize() {
    log("Easy Peasy Lemon Squeezy Databasey")
    log("Here to serve.")
    log("")
    log("Initializing...")
    mkdir.sync(this.storage.dir)
    // This file is used to indicate that the
    // database has already been created and is ready to use
    this.paths.stamp = `${this.storage.dir}/.stamp`
    if (this.storage.exists = fs.existsSync(this.paths.stamp)) {
      log(`Database exists, reading index into memory...`)
      let tableNames = fs.readdirSync(this.paths.tabledir(''))
      tableNames.forEach(tableName => {
        this.index.tables[tableName] =
          JSON.parse(fs.readFileSync(this.paths.indexfile(tableName)))
        this.storage.tables[tableName] = {
          lastId: this.index.tables[tableName].lastId,
          items: []
        }
      })
    } else {
      log(`New database, will be created once data is persisted`)
    }
  }

  createTable (table) {
    this.storage.tables[table] = {
      lastId: 0,
      items: []
    }
  }

  persistData () {
    return new Promise((resolve, reject) => {
      if (!this.storage.exists) {
        log("Now it's time to create a new database")
        fs.writeFile(this.paths.stamp, `${Date.now()}`, err => {
          if (err) reject(err)
        })
        this.storage.exists = true
      }
      for (let tableName in this.storage.tables) {
        let table = this.storage.tables[tableName]
        mkdir.sync(this.paths.tabledir(tableName))
        if (!this.index.tables[tableName]) {
          this.index.tables[tableName] = { index: {} }
        }
        this.index.tables[tableName].lastId = table.lastId
        let offset = 0
        let file = appendFile(this.paths.tablefile(tableName))
        for (let entryIx in table.items) {
          let entry = table.items[entryIx]
          // Skip already existing entries
          if (this.index.tables[tableName].index[`${entry.id}`]) {
            continue
          }
          // Start off with the last offset + its entry's length
          else if (Object.keys(this.index.tables[tableName].index).length > 0) {
            let lastItem = this.index.tables[tableName].index[`${table.beforeLastId}`]
            offset = lastItem.o + lastItem.l
          }
          // Create the string to save the data
          let jsonText = JSON.stringify(entry)
          // Create an index entry so that we can address this quickly
          this.index.tables[tableName].index[`${entry.id}`] = {
            o: offset,
            l: jsonText.length
          }
          // Append the entry to the file
          file.append(jsonText)
          // And now grow the offset to continue
          offset += jsonText.length
        }
        file.close()
        fs.writeFile(this.paths.indexfile(tableName),
          JSON.stringify(this.index.tables[tableName]), err => {
            if (err) {
              reject(err)
            } else {
              // Now that the data is persisted, remove it from memory
              table.items = []
            }
          }
        )
      }
    })
  }

  insert (table, data) {
    if (!this.storage.tables[table]) {
      this.createTable(table)
    }
    let tbl = this.storage.tables[table]
    tbl.beforeLastId = tbl.lastId
    data.id = ++tbl.lastId
    tbl.items.push(data)
    this.persistData().then(() => {}, e => throwAndLog(e))
    return tbl.lastId
  }

  update (table, data) {
    if (data.id === undefined || data.id === 0) {
      throw Error('id must exist and be at least 1')
    }
    let indexItem = this.index.tables[table].index[`${data.id}`]
    if (!indexItem) {
      return {}
    }
    let filename = this.paths.tablefile(table)
    let newData = JSON.stringify(data)
    let lastItem = this.index.tables[table]
      .index[`${this.storage.tables[table].lastId}`]
    indexItem.o = lastItem.o + lastItem.l
    indexItem.l = newData.length
    let file = appendFile(filename)
    file.append(newData)
    file.close()
    fs.writeFileSync(this.paths.indexfile(table),
      JSON.stringify(this.index.tables[table]))
    return this.get(table, data.id)
  }

  remove (table, id) {
    if (id === undefined || id === 0) {
      throw Error('id must exist and be at least 1')
    }
    let tableIndex = this.index.tables[table]
    if (!tableIndex || !tableIndex.index[`${id}`]) {
      return false
    }
    delete tableIndex.index[`${id}`]
    this.persistData()
    return true
  }

  get (table, id) {
    if (id === undefined || id === 0) {
      throw Error('id must exist and be at least 1')
    }
    let indexEntry = this.index.tables[table].index[`${id}`]
    if (!indexEntry) {
      return {}
    }
    return JSON.parse(
      readFilePartialSync(this.paths.tablefile(table),
      indexEntry.o, indexEntry.l))
  }

  getAll (table) {
    let result = []
    let tableIndex = this.index.tables[table].index
    var fd = fs.openSync(this.paths.tablefile(table), 'r');
    for (let tableIndexIx in tableIndex) {
      let entry = tableIndex[tableIndexIx]
      var buf = new Buffer(entry.l);
      fs.readSync(fd, buf, 0, entry.l, entry.o);
      result.push(JSON.parse(buf))
    }
    fs.close(fd);
    return result
  }
}

module.exports = (dir = 'datastorage') => {
  return new Database(dir)
}

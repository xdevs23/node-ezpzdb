
const mkdir = require('mkdir-p')
const fs = require('fs')
var util = null

const storage = {
  tables: {

  },
  dir: '',
  exists: false
}

const paths = {
  tabledir (table) {
    return `${storage.dir}/tables/${table}`
  },
  indexfile (table) {
    return `${paths.tabledir(table)}/index`
  },
  tablefile (table) {
    return `${paths.tabledir(table)}/db`
  }
}

const index = {
  tables: {}
}

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

module.exports = (dir = 'datastorage') => {
  log("Easy Peasy Lemon Squeezy Databasey")
  log("Here to serve.")
  log("")
  log("Initializing...")
  mkdir.sync(dir)
  storage.dir = dir
  // This file is used to indicate that the
  // database has already been created and is ready to use
  paths.stamp = `${storage.dir}/.stamp`
  if (storage.exists = fs.existsSync(paths.stamp)) {
    log(`Database exists, reading index into memory...`)
    let tableNames = fs.readdirSync(paths.tabledir(''))
    tableNames.forEach(tableName => {
      index.tables[tableName] =
        JSON.parse(fs.readFileSync(paths.indexfile(tableName)))
      storage.tables[tableName] = {
        lastId: index.tables[tableName].lastId,
        items: []
      }
    })
  } else {
    log(`New database, will be created once data is persisted`)
  }
  let dbobj = {
    createTable (table) {
      storage.tables[table] = {
        lastId: 0,
        items: []
      }
    },
    persistData () {
      return new Promise((resolve, reject) => {
        if (!storage.exists) {
          log("Now it's time to create a new database")
          fs.writeFile(paths.stamp, `${Date.now()}`, err => {
            if (err) reject(err)
          })
          storage.exists = true
        }
        for (let tableName in storage.tables) {
          let table = storage.tables[tableName]
          mkdir.sync(paths.tabledir(tableName))
          if (!index.tables[tableName]) {
            index.tables[tableName] = { index: {} }
          }
          index.tables[tableName].lastId = table.lastId
          let offset = 0
          let file = appendFile(paths.tablefile(tableName))
          for (entryIx in table.items) {
            let entry = table.items[entryIx]
            // Skip already existing entries
            if (index.tables[tableName].index[`${entry.id}`]) {
              continue
            }
            // Start off with the last offset + its entry's length
            else if (Object.keys(index.tables[tableName].index).length > 0) {
              let lastItem = index.tables[tableName].index[`${table.beforeLastId}`]
              offset = lastItem.o + lastItem.l
            }
            // Create the string to save the data
            let jsonText = JSON.stringify(entry)
            // Create an index entry so that we can address this quickly
            index.tables[tableName].index[`${entry.id}`] = {
              o: offset,
              l: jsonText.length
            }
            // Append the entry to the file
            file.append(jsonText)
            // And now grow the offset to continue
            offset += jsonText.length
          }
          file.close()
          fs.writeFile(paths.indexfile(tableName),
            JSON.stringify(index.tables[tableName]), err => {
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
    },
    insert (table, data) {
      if (!storage.tables[table]) {
        dbobj.createTable(table)
      }
      let tbl = storage.tables[table]
      tbl.beforeLastId = tbl.lastId
      data.id = ++tbl.lastId
      tbl.items.push(data)
      dbobj.persistData().then(() => {}, e => throwAndLog(e))
      return tbl.lastId
    },
    update (table, data) {
      if (data.id === undefined || data.id === 0) {
        throw Error('id must exist and be at least 1')
      }
      let indexItem = index.tables[table].index[`${data.id}`]
      if (!indexItem) {
        return {}
      }
      let filename = paths.tablefile(table)
      let newData = JSON.stringify(data)
      let lastItem = index.tables[table]
        .index[`${storage.tables[table].lastId}`]
      indexItem.o = lastItem.o + lastItem.l
      indexItem.l = newData.length
      let file = appendFile(filename)
      file.append(newData)
      file.close()
      fs.writeFileSync(paths.indexfile(table),
        JSON.stringify(index.tables[table]))
      return dbobj.get(table, data.id)
    },
    remove (table, id) {
      if (id === undefined || id === 0) {
        throw Error('id must exist and be at least 1')
      }
      let tableFolder = `${dir}/${table}`
      let folders = fs.readdirSync(tableFolder)
      for (let folderIx in folders) {
        let folder = folders[folderIx]
        let toUnlink = `${tableFolder}/${folder}/${id}`
        if (!fs.existsSync(toUnlink)) return false
        fs.unlinkSync(toUnlink)
      }
      return true
    },
    get (table, id) {
      if (id === undefined || id === 0) {
        throw Error('id must exist and be at least 1')
      }
      let indexEntry = index.tables[table].index[`${id}`]
      if (!indexEntry) {
        return {}
      }
      return JSON.parse(
        readFilePartialSync(paths.tablefile(table),
        indexEntry.o, indexEntry.l))
    },
    getAll (table) {
      let result = []
      let tableIndex = index.tables[table].index
      var fd = fs.openSync(paths.tablefile(table), 'r');
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
  return dbobj
}

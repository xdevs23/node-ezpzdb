'use strict'

const mkdir = require('mkdir-p')
const fs = require('fs')
const readlines = require('n-readlines')
const chalk = require('chalk')
const logsym = require('log-symbols')
const figures = require('figures')
const util = require('util')

/**
 * Interval used to check if data is ready to be persisted.
 * This does not mean that data WILL be written out after
 * the given interval. Whether data will or won't be written
 * out is decided by the function that is called by then.
 * This is the DEFAULT value. You can specify a custom value
 * when creating a new instance.
 */
const SAVE_DATA_INTERVAL_MS = 60 * 1000 // 1 minute

function log (...messages) {
  process.stdout.write('[ezpzdb] ')
  for (let ix in messages) {
    process.stdout.write(messages[ix].toString())
    process.stdout.write(' ')
  }
  process.stdout.write('\n')
}

function errlog (...messages) {
  process.stderr.write('[ezpzdb error] ')
  for (let ix in messages) {
    process.stderr.write(util.inspect(messages[ix]))
    process.stderr.write(' ')
  }
  process.stderr.write('\n')
}

function appendFile(file, mode = 'a') {
  let stream = fs.createWriteStream(file, { flags: mode })
  return {
    append (content) {
      stream.write(content)
    },
    async close () {
      stream.end()
    }
  }
}

/**
 * This is where all the action happens.
 * We want an instance of this class for every database
 */
module.exports = class Database {

  /**
   * Well... a constructor
   * Initializes variables and stuff
   *
   * dbpath - Directory to put the database into. Default: database
   * writesToSave - How many writes are necessary to save data
   *                after the interval has passed
   * deltaTimeToSave - How many minutes to wait before data is saved out
   *                   (if writes < writesToSave)
   *                   This is rather to make sure data is saved
   *                   even below the treshold in reasonable time.
   * saveDataInterval - Milliseconds to wait until checking if data
   *                    should be written out.
   */
  constructor (
    dbpath = 'database',
    writesToSave = 200,
    deltaTimeToSave = 10, // in minutes
    saveDataInterval = SAVE_DATA_INTERVAL_MS, // in milliseconds
  ) {
    // In-memory storage of inserts/updates/removals as well
    // as miscellaneous metadata and information like last ID
    // and whether and where to truncate the table. This is
    // an object containing table names as keys and objects
    // that are created in the createTable function.
    this.tables = {}
    // Path to the folder containing the database
    // Will be created when saving data if it has not been yet.
    this.dbpath = dbpath
    // How many insert/update/remove/truncate operations
    // have been done since the last time data was written out
    this.writes = 0
    // This is to determine whether the data in memory
    // should be written out if the number of writes did
    // not make that happen.
    // Let's say you had 7 writes in 10 minutes and 100 would
    // trigger a write-out. I'm pretty sure you would like to
    // have your data written out by now.
    this.lastWrite = Date.now()
    // As explained above
    this.writesToSave = writesToSave
    this.deltaTimeToSave = deltaTimeToSave * 60 * 1000
    this.saveDataInterval = saveDataInterval
    // Paths
    let paths = this.paths = {
      tableindex (table) {
        return `${paths.tabledir(table)}/index`
      },
      tablefile (table) {
        return `${paths.tabledir(table)}/db`
      },
      tablefilenew (table) {
        return `${paths.tablefile(table)}-new`
      },
      tabledir (table) {
        return `${dbpath}/tables/${table}`
      },
      metadata (table) {
        return `${paths.tabledir(table)}/meta`
      }
    }
    // Read the table indices etc. into memory if the database exists
    this.initialize()
    // Now start the timer for data saves
    this.setTimeoutForSaveData()
  }

  /**
   * Load important data into memory.
   * This reads the index of every table into memory
   * to allow fast access and other important metadata.
   * Only use this once - when the instance is created
   */
  initialize () {
    log('Initializing...')
    if (!fs.existsSync(this.dbpath)) {
      log('New database, will be created once data is saved')
    } else {
      log('Reading index into memory...')
      let tableNames = fs.readdirSync(this.paths.tabledir(''))
      for (let ix in tableNames) {
        let tableName = tableNames[ix]
        log(' ', chalk.blue.bold(figures.arrowRight), tableName)
        let table = this.createTable(tableName)
        let liner = new readlines(this.paths.tableindex(tableName));
        let metadata = JSON.parse(
          fs.readFileSync(this.paths.metadata(tableName)))
        table.lastId = metadata.lastId
        let next
        while (next = liner.next()) {
          let split = next.toString().split(',')
          let indexEntry = table.index[split[0]] = {
            pos: parseInt(split[1]),
            len: parseInt(split[2])
          }
        }
        log(' ', logsym.success,
          `Loaded ${Object.keys(table.index).length} items for ${tableName}`)
      }
    }
  }

  setTimeoutForSaveData () {
    setTimeout(this.saveData.bind(this), this.saveDataInterval)
  }

  /**
   * Call this periodically (i. e. every minute) to
   * write new data to disk (writing new data includes
   * inserts, updates, removals and truncate)
   *
   * Data saving is done in following order and will be
   * repeated for every table:
   *  - truncate
   *  - remove
   *  - update
   *  - insert
   *
   * Truncations are done first so that any inserts
   * after that get to use a lower ID than what it would
   * have been without truncating. By looking at the truncate
   * function you can also see that lastId is set to start,
   * which implies that when actually saving the data, the ID
   * corresponds to the one returned at that point of time.
   *
   * Order of insert/update/remove does NOT matter because they
   * present the state of data as it is when this function is invoked.
   * For example, removing an entry that is in the inserts array
   * and thus has not been saved yet will remove it from the
   * inserts (and updates) instead of doing both operations (which
   * is redundant).
   *
   * Removing entries does NOT affect lastId, that is to meet
   * the behavior of other database systems as well as make sure
   * that saving the data of the inserts does not change the ID
   * compared to the one that was returned when the item was inserted.
   *
   * Saving data is done asynchronously and not immediately to
   * ensure best performance and make recently inserted/updated
   * entries immediately available instead of having to re-fetch
   * them from disk or using the cache.
   *
   */
  saveData () {
    if (this.writes > this.writesToSave ||
        (this.writes > 0 &&
          Date.now() - this.lastWrite > this.deltaTimeToSave)) {
      new Promise((resolve, reject) => {
        log('Saving data')
        for (let tableName in this.tables) {
          log(' ', chalk.blue.bold(figures.arrowRight), tableName)
          let table = this.tables[tableName]
          if (table.inserts.length + table.updates.length +
              table.removals.length + table.truncate === -1) {
            log(logsym.info, 'No new data to save')
            continue
          }
          let beginTime = Date.now()
          mkdir.sync(this.paths.tabledir(tableName))
          let file = appendFile(this.paths.tablefilenew(tableName))
          let fd = fs.openSync(this.paths.tablefile(tableName), 'a+')
          fs.closeSync(fs.openSync(this.paths.tableindex(tableName), 'w'))
          let ixfile = appendFile(this.paths.tableindex(tableName))
          let curoffs = 0
          for (let id in table.index) {
            if (! (table.removals.includes(id) ||
                (table.truncate !== -1 && id > table.truncate))) {
              let updateIndex = table.updates.findIndex(item => {
                item.id === id
              })
              let len
              if (updateIndex !== -1) {
                let data
                file.append(data = JSON.stringify(table.updates[updateIndex]))
                len = data.length
              } else {
                let buf = new Buffer(table.index[id].len)
                fs.readSync(fd, buf, 0, buf.length, table.index[id].pos)
                file.append(buf)
                len = buf.length
              }
              table.index[id] = {
                pos: curoffs,
                len
              }
              ixfile.append([id, curoffs, len].join(','))
              ixfile.append('\n')
              curoffs += len
            }
          }
          fs.closeSync(fd)
          for (let ix in table.inserts) {
            let insert = table.inserts[ix]
            let data
            file.append(data = JSON.stringify(insert))
            ixfile.append([insert.id, curoffs, data.length].join(','))
            ixfile.append('\n')
            table.index[insert.id] = {
              pos: curoffs,
              len: data.length
            }
            curoffs += data.length
          }
          file.close()
          ixfile.close()
          fs.renameSync(this.paths.tablefilenew(tableName),
                        this.paths.tablefile(tableName))
          table.truncate = -1
          table.inserts.length = 0
          table.updates.length = 0
          table.removals.length = 0
          fs.writeFileSync(this.paths.metadata(tableName), JSON.stringify({
            lastId: table.lastId
          }))
          let deltaTime = Date.now() - beginTime
          log(' ', logsym.success, `Done, ${deltaTime/1000} s`)
        }

        this.writes = 0
        this.lastWrite = Date.now()
        resolve()
      }).then(() => {
        log('Data saved successfully')
        this.setTimeoutForSaveData()
      }).catch(err => errlog(err))
    } else {
      this.setTimeoutForSaveData()
    }
  }

  /**
   * Checks whether the given table exists
   * table - Name of the table to check for
   */
  tableExists (table) {
    return !!this.tables[table]
  }

  /**
   * Create a table if it does not exist
   * table - Name of the table
   */
  createTable (table) {
    if (!this.tableExists(table)) {
      return this.tables[table] = {
        inserts: [],
        updates: [],
        removals: [],
        cache: [],
        index: {},
        truncate: -1,
        lastId: 0
      }
    } else {
      return this.tables[table]
    }
  }

  /**
   * Insert a new entry into the given table
   * If the table does not exist, it will be created.
   * Columns will be derived from the keys in data
   *
   * tableName - Name of the table to insert the entry into
   * data - Entry as a key-value object to insert
   */
  insert (tableName, data) {
    this.createTable(tableName)
    let table = this.tables[tableName]
    data.id = ++table.lastId
    table.inserts.push(data)
    this.writes++
    return data.id
  }

  /**
   * Updates an existing entry
   * The current entry will be overwritten by
   * the new data - except for undefined values
   * null is a valid value and can be used to replace
   * an existing value.
   *
   * tableName - Name of the table to insert the entry into
   * data - Updated entry as a key-value object
   */
   update (tableName, data) {
     if (!this.tableExists(tableName)) {
       throw Error(`Can't update entries in non-existent table ${tableName}`)
     }

     let table = this.tables[tableName]
     let insertIx = table.inserts.findIndex(item => {
       return item.id === data.id
     })
     if (insertIx !== -1) {
       Object.assign(table.inserts[insertIx], data)
     } else {
       table.updates.push(data)
     }
     this.writes++
     return true
   }

   /**
    * Remove an entry from the given table
    * tableName - Name of the table to remove the entry from
    * id - ID of the entry to remove
    */
   remove (tableName, id) {
     if (!this.tableExists(tableName)) {
       throw Error(`Can't remove entries from non-existent table ${tableName}`)
     }

     let table = this.tables[tableName]
     let insertIx = table.inserts.findIndex(item => {
       return item.id === id
     })
     if (insertIx !== -1) {
       table.inserts.splice(insertIx, 1)
     } else {
       let updateIx = table.updates.findIndex(item => {
         return item.id === id
       })
       if (updateIx !== -1) {
         table.updates.splice(updateIx, 1)
       } else {
         table.removals.push(id)
       }
     }
     this.writes++
     return true
   }

   /**
    * Truncate the given table
    * tableName - Name of the table to truncate
    * start - Anything bigger than this ID is removed
    */
   truncate (tableName, start) {
     if (!this.tableExists(tableName)) {
       throw Error(`Can't truncate non-existent table ${tableName}`)
     } else if (start > table.lastId) {
       throw Error(`Specified trim position ${start} is bigger than last ID ` +
                   `${table.lastId} Make sure it is in bounds.`)
     }

     let table = this.tables[tableName]
     [table.inserts, table.removals, table.updates].forEach(
       ops => ops.forEach(item => {
         if (item.id > start) {
           ops.splice(ops.indexOf(item), 1)
         }
       })
     )

     table.truncate = start
     table.lastId = start
     this.writes++
     return true
   }

   get (tableName, id) {
     if (!this.tableExists(tableName)) {
       throw Error(`Cannot get ${id} from non-existent table ${tableName}`)
     }

     let table = this.tables[tableName]
     let updateIx = table.updates.findIndex(item => {
       return item.id === id
     })
     if (updateIx === -1) {
       let insertIx = table.inserts.findIndex(item => {
         return item.id === data.id
       })
       if (insertIx !== -1) {
         return table.inserts[insertIx]
       } else {
         let removalIx = table.removals.findIndex(item => {
           return item.id === id
         })
         if (removalIx === -1) {

         } else {
           return null
         }
       }
     } else {
       return table.updates[updateIx]
     }
     return null
   }

   getAll (tableName) {
     if (!this.tableExists(tableName)) {
       throw Error(`Cannot get all from non-existent table ${tableName}`)
     }

     let table = this.tables[tableName]
     return table.inserts.concat(table.updates)
   }

}

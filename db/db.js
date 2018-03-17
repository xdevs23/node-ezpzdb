'use strict'

/**
 * This is where all the action happens.
 * We want an instance of this class for every database
 */
module.exports = class Database {

  /**
   * Well... a constructor
   * Initializes variables and stuff
   *
   * dbpath - Directory to put the database into
   */
  constructor (dbpath) {
    this.tables = {}
    this.dbpath = dbpath
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
      this.tables[table] = {
        inserts: [],
        updates: [],
        removals: [],
        truncate: -1,
        lastId: 0
      }
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

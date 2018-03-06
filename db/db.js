
const mkdir = require('mkdir-p')
const fs = require('fs')

module.exports = (dir = 'datastorage', structure = {}) => {
  mkdir.sync(dir)
  for (let tableName in structure) {
    let table = structure[tableName]
    for (let colName in table) {
      mkdir.sync(`${dir}/${tableName}/${colName}`)
    }
  }
  let dbobj
  dbobj = {
    insert (table, data) {
      let newId = 0
      for (let key in data) {
        let folder = `${dir}/${table}/${key}`
        mkdir.sync(folder)
        if (newId === 0) {
          let files = fs.readdirSync(folder)
          let sortedFiles = files.sort((a, b) => b - a)
          if (sortedFiles.length === 0) {
            newId = 1
          } else {
            newId = Number.parseInt(sortedFiles[0])
            if (newId === NaN) {
              throw Error(`NaN can't be used as key`)
            }
            newId++
          }
        }
        let finalFile = `${folder}/${newId}`
        fs.writeFileSync(finalFile, JSON.stringify(data[key]))
      }
      return newId
    },
    update (table, data) {
      if (data.id === undefined || data.id === 0) {
        throw Error('id must exist and be at least 1')
      }
      for (let key in data) {
        fs.writeFileSync(
          `${dir}/${table}/${key}/${data.id}`, JSON.stringify(data[key]))
      }
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
    get (table, id, args = null) {
      if (id === undefined || id === 0) {
        throw Error('id must exist and be at least 1')
      }
      let tableFolder = `${dir}/${table}`
      let result = { id }
      if (args === null) {
        let args = fs.readdirSync(tableFolder)
      }
      for (let arg in args) {
        result[arg] = JSON.parse(
            fs.readFileSync(`${tableFolder}/${arg}/${id}`))
      }
      return result
    },
    getAll (table) {
      let result = []
      let tableFolder = `${dir}/${table}`
      let folders = fs.readdirSync(tableFolder)
      let sortedFiles = fs.readdirSync(
        `${tableFolder}/${folders[0]}`).sort((a, b) => b - a)
      let lastId = Number.parseInt(sortedFiles[0])
      for (let i = 1; i <= lastId; i++) {
        let item = { id: i }
        let add = true
        for (let folderIx in folders) {
          let folder = folders[folderIx]
          let toGet = `${tableFolder}/${folder}/${i}`
          if (!fs.existsSync(toGet)) {
            add = false
            break
          }
          item[folder] = JSON.parse(
            fs.readFileSync(toGet))
        }
        if (add) result.push(item)
      }
      return result
    }
  }
  return dbobj
}

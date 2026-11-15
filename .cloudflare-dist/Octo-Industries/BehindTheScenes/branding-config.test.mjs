import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function evaluateBrandingScript() {
  const source = await readFile(new URL('../branding/game-branding.js', import.meta.url), 'utf8');
  const appended = [];
  const body = {
    dataset: {},
    style: { setProperty(name, value) { this[name] = value; } },
    append: (...nodes) => {
      for (const node of nodes.filter(Boolean)) {
        node.isConnected = true;
        appended.push(node);
      }
    },
    querySelector: () => null,
  };

  const badgeMethods = {
    addEventListener() {},
    append() {},
    setAttribute() {},
    setPointerCapture() {},
    focus() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 64, height: 64 };
    },
    classList: { add() {}, remove() {} },
  };

  const document = {
    body,
    currentScript: {
      src: 'file:///workspaces/Personal/Octo-Industries/branding/game-branding.js',
    },
    querySelectorAll: () => [],
    createElement: (tagName) => {
      const node = {
        tagName,
        className: '',
        style: {},
        children: [],
        href: '',
        alt: '',
        draggable: false,
        loading: '',
        isConnected: false,
        setAttribute() {},
        append(...children) {
          this.children.push(...children);
        },
        remove() {
          this.isConnected = false;
        },
        addEventListener() {},
        setPointerCapture() {},
        focus() {},
        getBoundingClientRect() {
          return { left: 0, top: 0, width: 64, height: 64 };
        },
        classList: { add() {}, remove() {} },
      };
      if (tagName === 'a') {
        Object.assign(node, badgeMethods);
      }
      return node;
    },
  };

  const windowObject = {
    document,
    localStorage: {
      getItem: () => null,
      setItem() {},
    },
    innerWidth: 1200,
    innerHeight: 800,
  };

  vm.runInNewContext(source, {
    window: windowObject,
    document,
    localStorage: windowObject.localStorage,
    URL,
    console,
  });

  return { body, appended, windowObject };
}

test('global branding config updates the live overlay without duplicating badges', async () => {
  const { body, appended, windowObject } = await evaluateBrandingScript();

  assert.equal(body.dataset.octoHomeCorner, 'top-left');
  assert.equal(body.dataset.octoWatermarkCorner, 'bottom-right');
  assert.equal(body.style['--octo-watermark-opacity'], '0.15');
  assert.equal(appended.filter((node) => node.className === 'octo-game-brand').length, 1);

  windowObject.OCTO_GAME_BRANDING_CONFIG = {
    hubButtonPosition: 'bottom-left',
    watermarkPosition: 'none',
    watermarkOpacity: 0.32,
  };

  assert.equal(body.dataset.octoHomeCorner, 'bottom-left');
  assert.equal(body.dataset.octoWatermarkCorner, 'none');
  assert.equal(body.style['--octo-watermark-opacity'], '0.32');
  assert.equal(appended.filter((node) => node.className === 'octo-game-brand').length, 1);
});

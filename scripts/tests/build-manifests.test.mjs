// Static checks that the autotools / mingw file lists still describe the tree,
// so `make dist` (and a build from the tarball) keeps working. They read the
// Makefile.am / Makefile.common files as text; nothing is built or run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Directories that never hold tracked sources.
const SKIP = new Set(['.git', 'node_modules']);

function findFiles(dir, name, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) findFiles(p, name, out);
        else if (e.name === name) out.push(p);
    }
    return out;
}

// Joins backslash continuations and returns [name, tokens[]] for every `NAME = ...` / `NAME += ...`.
function assignments(text, op = /[:+]?=/) {
    const joined = text.replace(/\\\r?\n/g, ' ');
    const out = [];
    for (const line of joined.split(/\r?\n/)) {
        const m = line.match(new RegExp(`^([A-Za-z_][A-Za-z0-9_]*)\\s*(${op.source})(.*)$`));
        if (m) out.push([m[1], m[3].replace(/#.*$/, '').trim().split(/\s+/).filter(Boolean)]);
    }
    return out;
}

function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('every literal EXTRA_DIST entry in a Makefile.am exists', () => {
    const missing = [];
    for (const mk of findFiles(root, 'Makefile.am')) {
        const dir = path.dirname(mk);
        for (const [name, tokens] of assignments(fs.readFileSync(mk, 'utf8'))) {
            if (name !== 'EXTRA_DIST') continue;
            for (const tok of tokens) {
                if (/[$@]/.test(tok) || tok === '\\') continue;
                if (!fs.existsSync(path.join(dir, tok))) missing.push(path.relative(root, path.join(dir, tok)));
            }
        }
    }
    assert.deepEqual(missing, []);
});

test('plugin Makefile.am files give their program a source in every configuration', () => {
    // An unset conditional source variable becomes ".cc" in `make distdir`.
    const ase = read('tools/aseprite_plugin/Makefile.am');
    assert.match(ase, /^exult_shp_SOURCES\s*=\s*exult_shp\.cc$/m);
    assert.match(ase, /^EXTRA_PROGRAMS\s*=\s*exult_shp$/m);

    const gimp = read('tools/gimp_plugin/Makefile.am');
    // GIMP 3, GIMP 2 and "no GIMP" each set the variable.
    assert.equal([...gimp.matchAll(/^GIMP_PLUGIN_SRC\s*=/gm)].length, 3);
    assert.match(gimp, /^EXTRA_PROGRAMS\s*=\s*u7shp$/m);
    assert.match(gimp, /^EXTRA_DIST\s*=.*\bu7shp-old\.cc\b/m);
});

test('shortcutbar.vga depends on its manifest and every shape (Makefile.am and Makefile.common)', () => {
    const shapes = fs.readdirSync(path.join(root, 'data')).filter((f) => /^sb_.*\.shp$/.test(f));
    assert.ok(shapes.length > 0);

    const am = Object.fromEntries(assignments(read('data/Makefile.am'), /=/));
    const amObjs = am.EXULT_SHORTCUTBAR_VGA_OBJECTS;
    assert.ok(amObjs, 'data/Makefile.am: EXULT_SHORTCUTBAR_VGA_OBJECTS is not defined');
    assert.ok(amObjs.includes('shortcutbar.in'));
    for (const s of shapes) assert.ok(amObjs.includes(s), `data/Makefile.am: ${s} is not a prerequisite`);
    // The generated archive must not be in EXTRA_DIST; its sources are.
    assert.ok(!am.EXTRA_DIST.includes('$(EXULT_SHORTCUTBAR_VGA)'));
    assert.ok(am.EXTRA_DIST.includes('$(EXULT_SHORTCUTBAR_VGA_OBJECTS)'));

    const common = Object.fromEntries(assignments(read('Makefile.common'), /:=/));
    const cObjs = common.EXULT_SHORTCUTBAR_VGA_OBJECTS;
    assert.ok(cObjs, 'Makefile.common: EXULT_SHORTCUTBAR_VGA_OBJECTS is not defined');
    assert.ok(cObjs.includes('data/shortcutbar.in'));
    for (const s of shapes) assert.ok(cObjs.includes(`data/${s}`), `Makefile.common: data/${s} is not a prerequisite`);
});

// Every file reachable from a mod's usecode.uc by #include must be listed in
// that mod's Makefile.am and Makefile.mingw, or tarball builds cannot compile it.
test('content mod Makefiles list every #included usecode file', () => {
    const content = path.join(root, 'content');
    const problems = [];
    for (const d of fs.readdirSync(content, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const dir = path.join(content, d.name);
        const makefiles = ['Makefile.am', 'Makefile.mingw']
            .filter((f) => fs.existsSync(path.join(dir, f)))
            .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);
        if (makefiles.length === 0) continue;
        for (const uc of findFiles(dir, 'usecode.uc')) {
            const base = path.dirname(uc);
            const seen = new Set();
            const stack = [uc];
            while (stack.length) {
                const f = stack.pop();
                if (seen.has(f)) continue;
                seen.add(f);
                const text = fs.readFileSync(f, 'utf8');
                for (const m of text.matchAll(/^\s*#include\s+"([^"]+)"/gm)) {
                    for (const cand of [path.resolve(path.dirname(f), m[1]), path.resolve(base, m[1])]) {
                        if (fs.existsSync(cand)) {
                            stack.push(cand);
                            break;
                        }
                    }
                }
            }
            for (const f of seen) {
                const rel = path.relative(dir, f).split(path.sep).join('/');
                for (const [name, text] of makefiles) {
                    if (!text.includes(rel)) problems.push(`content/${d.name}/${name} is missing ${rel}`);
                }
            }
        }
    }
    assert.deepEqual(problems, []);
});

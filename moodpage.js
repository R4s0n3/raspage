/*
 * One moodpage in one element.
 *
 *   const page = MOODPAGE.create(element, {
 *     mood,                 // a mood object: mood.js, or the same shape as JSON
 *     interactive: true,    // false: no touch (a thumbnail); drops still land
 *     sound: true,          // false: always silent
 *     room: { url, room },  // optional: share the water through server.js
 *   });
 *
 *   page.setMood(nextMood); // change the weather in place
 *   page.addDrop(x, y);     // a stone from elsewhere (normalized 0..1)
 *   page.pause();           // e.g. scrolled off screen, app in background
 *   page.resume();
 *   page.destroy();         // frees the GPU and audio, removes the canvases
 *
 * The element gets the `moodpage` class and its own canvases, veil and
 * palette variables, and fills whatever box it is given. Several can live on
 * one screen, but phones only allow a handful of WebGL contexts: keep the
 * live ones few and destroy the ones that leave.
 */
(() => {
  "use strict";

  const MOODPAGE = (window.MOODPAGE = window.MOODPAGE || {});

  const PALETTE = ["night", "deep", "haze", "light", "glow"];

  const layer = (tag, name) => {
    const node = document.createElement(tag);
    node.className = name;
    node.setAttribute("aria-hidden", "true");
    return node;
  };

  MOODPAGE.create = (element, options = {}) => {
    let mood = options.mood || window.MOOD;
    if (!element || !mood) {
      return null;
    }

    const scene = layer("canvas", "moodpage-scene");
    const motesCanvas = layer("canvas", "moodpage-motes");
    const veil = layer("div", "moodpage-veil");
    element.classList.add("moodpage");
    element.prepend(scene, motesCanvas, veil);

    // The CSS fallback and the veil read the palette from the element.
    const applyPalette = () => {
      for (const name of PALETTE) {
        if (mood.palette?.[name]) {
          element.style.setProperty("--" + name, mood.palette[name]);
        }
      }
    };
    applyPalette();

    const water = MOODPAGE.createWater(element, mood, {
      interactive: options.interactive !== false,
    });

    // Paused by the caller, or by a hidden page: either one stops it.
    let held = false;
    let running = true;

    let sky = null;
    const makeSky = () => {
      sky = MOODPAGE.createSky(scene, mood, water, {
        // A restored context is a fresh GPU: build the sky again on it.
        onContextRestored: () => {
          sky?.destroy({ keepContext: true });
          makeSky();
        },
      });
      element.classList.toggle("no-webgl", !sky);
      if (!running) {
        sky?.pause();
      }
    };
    makeSky();

    const motes = MOODPAGE.createMotes(motesCanvas, mood, water);
    const sound =
      options.sound === false
        ? null
        : MOODPAGE.createSound(element, mood, water);
    const room = options.room
      ? MOODPAGE.connectRoom(water, options.room)
      : null;

    const update = () => {
      const run = !held && !document.hidden;
      if (run === running) {
        return;
      }
      running = run;
      for (const part of [water, sky, motes, sound, room]) {
        if (run) {
          part?.resume();
        } else {
          part?.pause();
        }
      }
    };
    document.addEventListener("visibilitychange", update);
    update();

    return {
      element,
      water,
      get mood() {
        return mood;
      },
      setMood(next) {
        if (!next || next === mood) {
          return;
        }
        mood = next;
        applyPalette();
        water.setMood(mood);
        sky?.setMood(mood);
        motes?.setMood(mood);
        sound?.setMood(mood);
      },
      addDrop: (x, y, strength = 1, slot) =>
        water.addDrop(x, y, strength, slot),
      addStroke: (x0, y0, x1, y1, strength = 1, slot) =>
        water.addStroke(x0, y0, x1, y1, strength, slot),
      pause() {
        held = true;
        update();
      },
      resume() {
        held = false;
        update();
      },
      destroy() {
        document.removeEventListener("visibilitychange", update);
        room?.close();
        sound?.destroy();
        motes?.destroy();
        sky?.destroy();
        water.destroy();
        scene.remove();
        motesCanvas.remove();
        veil.remove();
        element.classList.remove("moodpage", "no-webgl");
        for (const name of PALETTE) {
          element.style.removeProperty("--" + name);
        }
      },
    };
  };
})();

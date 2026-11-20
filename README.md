# Retro Cam

A pocket Y2K digital camera that runs in the browser and installs like an app.
Live lo-fi viewfinder, 1.6 MP photos (1792 × 896, 2:1), four looks, a red-orange LED
date stamp, frames, and a film roll that stays on the device.

Photos are developed like a cheap 2000s camera: the picture is processed at ~0.3 MP
(colour, haze, grain), sharpened and JPEG-compressed in the camera, then enlarged to
1.6 MP. By default it's wrapped in a film border (sprocket holes, frame numbers, and the
date in the bottom band), so the saved file is about 1954 × 1318.

Live at **https://retro.sagunpradhan.com.np**

No build step and no dependencies. It's plain HTML, CSS and JavaScript.

```
index.html      the camera (always horizontal; turns sideways on a phone held upright)
styles.css      body colours, LCD, layout
app.js          camera, image pipeline, date stamp, roll (IndexedDB), install prompt
manifest.json   install details (name, icons, landscape)
sw.js           offline cache of the app files
icons/          app icons (PNG + SVG)
tools/make-icons.mjs   regenerates icons/ (node tools/make-icons.mjs)
CNAME           custom domain for GitHub Pages
```

## Using it

- **Life-size.** On a phone the camera is drawn at the real Charmera's size, 58 × 24.5 mm (scaled from
  Apple's published screen densities for each iPhone; other phones use the standard 160 dp per inch).
  On a computer it fills the window instead.
- **Two layouts**, switched with the layout button in the row of toggles:
  - **Vertical** (default when the phone is upright): the camera across the screen, with **Play** and
    **Video** buttons underneath.
  - **Horizontal**: with the phone upright the whole camera is flipped 90°, so you hold the phone
    sideways (top to the left) like the real camera; the live picture turns with it. With the phone
    actually sideways (rotation lock off) it's simply the horizontal camera.
  Photos and videos always come out wide (1792×896 photo area, 640×320 video), matching the screen.
- **Light** under the viewfinder: green in photo mode, red in video mode, blinking while recording.
  The red dot on the top-edge button lights up in video mode too.
- **Shutter:** the big red button on the body, the extra capture button (under the camera in vertical
  mode, at the right edge in horizontal mode), or tap the screen. After a shot it stays on the
  screen for 5 seconds; press the shutter again (or tap the screen) to go straight back to the
  live view. Every shot is kept in the film roll. Space/Enter works on a computer, and so do
  Bluetooth selfie remotes. iPhone Safari doesn't let websites use the volume buttons.
- **▲ / ▼** change the look: Y2K, Warm, CCD, B&W. You can also swipe across the screen. Extra ▲ ▼
  and Play buttons sit next to the camera: horizontal = arrows above the right-edge capture button
  and Play on the left; vertical = Play, Capture and Video in one row, with the arrows stacked above Video.
- **Save** (download arrow in the row of toggles) opens the film roll: tick the shots you want, then
  **Save to Photos** (share sheet → *Save Images*). Select all / Delete are there too.
- **▶ Playback:** shows your newest shot on the camera's screen; **▼** goes to older shots, **▲** to
  newer ones (or swipe). **Save** puts the shot on screen into Photos (share sheet → *Save Image*);
  Tapping the photo, or the **Full** button outside the camera (under it in vertical mode, next to
  Play in horizontal mode), zooms the camera's screen up to full screen: swipe sideways through every
  shot, **Save** the one you're on, **✕** zooms back down. Full works outside playback too (newest shot).
  **All** opens the film roll, where you tap shots to select several and save or delete them
  together. Press ▶ or the shutter to go back to shooting.
- **Video:** the small button with the red dot on the top edge (the camera button below it when
  upright) switches between photo and video.
  In video mode the shutter starts and stops recording (lo-fi 640×320, 24 fps, with sound, up to
  60 s). Video gets the same look and date stamp.
- **Camera** (next to Full): full-screen camera mode. The live picture fills the screen on the left
  (rendered at twice the size) with only Play, ▲ ▼ and a capture button on the right, plus a button
  to leave. Review, playback and the arrows work as usual. Upright, the controls run along the bottom.
- **Wide**: rear camera → the phone's ultra-wide (0.5×) lens, found by its name (iPhone: "Back Ultra
  Wide Camera"). Selfie camera → the front sensor's full 4:3 picture instead of the 16:9 crop (about a
  third wider side to side with the phone upright; Safari doesn't allow zooming the front camera below
  1×). Phones with neither fall back to zooming out as far as allowed. The LCD shows REAR 0.5× /
  SELFIE WIDE, or NO WIDE.
- **Lens** (appears with the selfie camera): the camera turns round to show its front (viewfinder
  window, flash window, rainbow band, and the iPhone's own notch hardware: front camera, Face ID
  sensors and speaker, drawn life-size and lined up with the real notch), so you don't see yourself, just like holding the
  real thing. Tap the camera's front or a capture button to shoot; it turns back to show the photo
  for the 5-second review, then back to the lens. The flash window glows red while recording. In Lens view the drawn lens follows
  the phone's real selfie camera: upright, the camera is centred near the top with its lens in the
  middle near the top; sideways, the whole camera sits on the left, half way down, with its lens at the left end.
- **HQ** (in the option row) switches from the vintage look to high quality: full camera resolution
  (up to 3840×1920), the chosen look's colours without grain or JPEG crunch, saved at high quality.
  Video goes to 960×480. Off by default.
- Option row: sound, flash, date stamp, frame (film border by default, then none / instant / round),
  HQ, save, and in vertical mode layout + flip camera. In horizontal mode flip camera sits above the
  right-hand arrows and the layout toggle below the right-edge capture button. Colour dots are on
  their own row underneath.
- The coloured dots change the body: Yellow, Clear, Red, Blue, Black.

## Deploy on GitHub Pages (retro.sagunpradhan.com.np)

1. Create a new GitHub repository (for example `retro-cam`) and push this folder to `main`.
   It needs its own repo, because the photobooth repo's Pages site already uses
   `photobooth.sagunpradhan.com.np`.
2. In the repo: **Settings → Pages → Build and deployment → Deploy from a branch**,
   choose `main` and `/ (root)`.
3. At your DNS provider, add a record:

   | Type  | Name    | Value                |
   |-------|---------|----------------------|
   | CNAME | `retro` | `sagunnn.github.io`  |

4. Back in **Settings → Pages**, the custom domain should read `retro.sagunpradhan.com.np`
   (from the `CNAME` file). Once the certificate is issued, tick **Enforce HTTPS**.
   This can take a few minutes up to an hour.

### Or on Vercel

`npx vercel` from this folder (framework: *Other*, no build command, output: `.`), then
add the domain `retro.sagunpradhan.com.np` in the project and point a `CNAME retro` record
at `cname.vercel-dns.com`.

### Updating

1. After changing `styles.css` or `app.js`, run `node tools/stamp.mjs`. It puts a content hash
   on their URLs in `index.html` (`app.js?v=…`), so Cloudflare's cache can't keep serving
   old files after a deploy.
2. Commit and push to `main`. Pages redeploys in about a minute.

The service worker tries the network first, so the next launch picks up the new files. Only
bump `VERSION` in `sw.js` if you rename or remove a file listed in `SHELL`.

## Testing on a phone

The live camera only works over **HTTPS** (or `localhost`), so a phone can't use
`http://192.168.x.x`. If it's opened over plain HTTP, the app says so and offers
**Use phone camera** instead, which runs the phone's own camera app and applies the same look.

- Easiest: deploy, then open the HTTPS URL on the phone.
- Before deploying: run `python3 -m http.server 8000` here and open a tunnel, for example
  `npx localtunnel --port 8000` or `cloudflared tunnel --url http://localhost:8000`.
  Open the `https://…` address it prints on the phone.
- On a computer, `http://localhost:8000` works directly.

### Install on iPhone

Open the site in **Safari**, then tap **Share → Add to Home Screen** (the app's **Install**
button shows this hint too). It then opens full screen with no browser bars. Safari asks for
camera permission the first time.

### Install on Android

Chrome shows **Install** in the row under the camera (or use ⋮ → *Install app*).

## Notes

- Photos and the roll never leave the device. The roll lives in the browser's storage
  (IndexedDB), so clearing the site's data or uninstalling deletes it. Save the ones you want.
- With rotation lock on, an iPhone keeps Safari in portrait while you hold it sideways. The app
  turns itself and the live camera feed to match. Hold it with the top of the phone to the left.
- Flash uses the phone's torch on the rear camera where the browser allows it (Android Chrome).
  Otherwise, and for selfies, the screen flashes white.
- iPhone has no vibration API for websites. On iOS 18 and later the app uses the system
  switch haptic for the shutter tick instead.

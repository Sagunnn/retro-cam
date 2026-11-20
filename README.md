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

- **Hold it either way.** It's always the same horizontal camera. With the phone upright it spans
  the screen width, with a big capture button and a video-mode button underneath. Photos and
  videos always come out wide (1792×896 photo area, 640×320 video), matching the screen.
- **Light** next to the viewfinder: green in photo mode, red in video mode, blinking while recording.
- **Shutter:** the big red button (on the body when horizontal, below the camera when upright), or tap
  the screen. Each shot goes straight
  into the film roll, so you can keep shooting. Space/Enter works on a computer, and so do Bluetooth
  selfie remotes. iPhone Safari doesn't let websites use the volume buttons.
- **▲ / ▼** change the look: Y2K, Warm, CCD, B&W. You can also swipe across the screen.
- **▶** (under the viewfinder) opens the film roll. Tap shots to select them (or **Select all**),
  then **Save to Photos**. On iPhone that opens the share sheet; choose *Save Images* / *Save Video*.
  On a computer the files download. **Delete** removes the selected shots from the roll.
- **Video:** the small button with the red dot on the top edge (the camera button below it when
  upright) switches between photo and video.
  In video mode the shutter starts and stops recording (lo-fi 640×320, 24 fps, with sound, up to
  60 s). Video gets the same look and date stamp.
- Row under the camera: switch camera, flash, date stamp, frame (film border by default, then none /
  instant / round), sound.
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

# MOHSEN PLAYER — Spotify-inspired personal music library

A static public music player for GitHub Pages. Audio is streamed by the browser from files stored in this public repository.

## Add a song

1. Upload the audio file into `music/` (MP3 is recommended).
2. Open `tracks.json` and add an entry:

```json
{
  "tracks": [
    {
      "title": "Track Name",
      "artist": "Artist Name",
      "album": "My Collection",
      "src": "music/track-name.mp3",
      "cover": "covers/track-cover.jpg"
    }
  ]
}
```

3. Commit the changes. After GitHub Pages deploys, refresh the site. The track appears for every visitor.

`cover` and `album` are optional. For multiple tracks, add comma-separated objects inside the `tracks` array. Paths are relative to the repository root. Use simple filenames without unusual characters; if a filename contains spaces, URL-encode them or rename it.

## Publish with GitHub Pages

1. Create a **public** GitHub repository.
2. Upload the contents of this folder to the repository root (not the ZIP itself).
3. Go to **Settings → Pages**.
4. Under Build and deployment, choose **Deploy from a branch**.
5. Select branch `main` and folder `/(root)`, then Save.
6. Open the Pages URL shown there.

## Important: public means public

Anyone who can access the site can also access the audio files and artwork in the public repository. Only upload music you own or have permission to distribute. This player does not provide DRM, accounts, or private access control.

## Practical hosting notes

GitHub Pages is static hosting, not a dedicated music CDN. Keep audio files reasonably sized, prefer MP3, and avoid very high traffic or large lossless files. Check GitHub's current repository, file-size, and Pages usage limits before building a large catalogue.

## Controls

- Play / pause, next / previous
- Shuffle and repeat
- Seek and volume
- Space: play / pause
- Left / right arrows: seek 5 seconds

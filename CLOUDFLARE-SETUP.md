# MOHSEN PLAYER — Cloudflare upload setup

The public GitHub Pages player reads `tracks.json`. The admin page sends audio to a Cloudflare Worker. The Worker holds the GitHub access token as a Cloudflare Secret and commits the audio file plus catalogue update to this repository.

## 1. Create the Worker

1. Sign in to [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Open **Workers & Pages**.
3. Select **Create application** → **Create Worker** → **Deploy**.
4. Name it `mohsen-player-uploader`.
5. Open the new Worker and select **Edit Code**.
6. Replace the starter code with the complete contents of [cloudflare-worker.js](https://github.com/mohamed20034/mohsenplayer/blob/main/cloudflare-worker.js).
7. Select **Deploy**.
8. Copy the Worker URL shown by Cloudflare. It should look like `https://mohsen-player-uploader.<your-subdomain>.workers.dev`.

## 2. Create a GitHub token limited to this repository

1. Open [Fine-grained personal access tokens](https://github.com/settings/personal-access-tokens/new).
2. Give the token a name such as `MOHSEN PLAYER Cloudflare Worker` and choose an expiry.
3. Set **Resource owner** to `mohamed20034`.
4. Under **Repository access**, choose **Only select repositories**, then select `mohsenplayer`.
5. Under **Repository permissions**, set **Contents** to **Read and write**. Keep other permissions at their defaults.
6. Generate the token and copy it. Do not paste it into this repository, the player page, or a chat message.

GitHub's Contents API supports fine-grained tokens with the repository Contents write permission for creating and updating files.

## 3. Generate a separate upload key

1. Open the [Admin Upload page](https://mohamed20034.github.io/mohsenplayer/admin.html).
2. Select **Generate Secure Key**.
3. Copy the generated value and keep it in your password manager for later.

This key is separate from the GitHub token. It is the password that lets your admin page call your Worker.

## 4. Add both values as Cloudflare Secrets

1. In Cloudflare, open your `mohsen-player-uploader` Worker.
2. Open **Settings** → **Variables and Secrets** → **Add**.
3. Select type **Secret**:
   - Name: `GH_TOKEN`
   - Value: paste the fine-grained GitHub token.
4. Add another Secret:
   - Name: `UPLOAD_KEY`
   - Value: paste the generated upload key from step 3.
5. Save / Deploy the changes.

Do not add either value as a plain-text variable. Cloudflare Secrets are encrypted and are available to the Worker through its `env` parameter.

## 5. Connect the Admin page

1. Return to the [Admin Upload page](https://mohamed20034.github.io/mohsenplayer/admin.html).
2. Paste your Worker URL.
3. Paste the same upload key you stored as `UPLOAD_KEY`.
4. Select **Check Worker Connection**. A success message should appear.
5. Choose an audio file (up to 20 MB), enter its title / artist / album, then upload.

The Worker commits the audio into `music/` and updates `tracks.json`. GitHub Pages republishes the library after the new commit.

## Troubleshooting

- **Worker URL not reachable:** check that the URL is the exact `workers.dev` address and that the Worker is deployed.
- **Upload key incorrect:** the Admin page key must exactly match the Cloudflare `UPLOAD_KEY` Secret.
- **GitHub denied access:** check that the fine-grained token is for `mohsenplayer` only and has **Contents: Read and write**.
- **Worker missing GH_TOKEN:** add a Cloudflare Secret named exactly `GH_TOKEN`, then deploy the Worker again.
- **Audio uploaded, catalogue update failed:** inspect the Worker logs and check that `tracks.json` remains valid JSON.

## Security notes

- Never commit the GitHub token or upload key into GitHub.
- Never send the GitHub token in a chat.
- The repository is public, so uploaded audio and track metadata are publicly accessible to anyone with the site or repository URL.
- The current Worker restricts browser origins to `https://mohamed20034.github.io` and accepts audio files up to 20 MB.

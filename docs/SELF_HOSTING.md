# Self-hosting Better Lift (home PC + Cloudflare, $0/month)

This guide turns a spare PC into the Better Lift server. Everything used here is free:

| Piece | What it does | Cost |
|---|---|---|
| Your PC + Ubuntu Server | Runs the backend (PocketBase) and stores all data | Free |
| Cloudflare Tunnel | Makes the backend reachable at `https://api.yourdomain.com`. You don't open router ports, and it keeps working when your home IP changes | Free |
| Cloudflare Pages | Hosts the app itself at `https://app.yourdomain.com` | Free |
| Your domain | You already own it | (already paid) |

Throughout this guide, replace `yourdomain.com` with your real domain.

---

## Part 0: What you need

- **A PC that can stay on 24/7.** Any 64-bit Intel/AMD machine from the last ~10 years is fine. 4 GB RAM and a 64 GB+ drive is plenty. **Everything on its drive will be wiped.**
- **A USB stick**, 8 GB or larger. It will be wiped too.
- **An Ethernet cable** from the PC to your router. Wi-Fi works, but wired is more reliable.
- **Another computer** for writing the USB stick and using the dashboards.
- **A free [Cloudflare](https://dash.cloudflare.com/sign-up) account.**
- **A free [GitHub](https://github.com) account** with access to the BetterLift repo.

---

## Part 1: Install Ubuntu Server on the PC

### 1.1 Make the install USB
1. Download **Ubuntu Server 24.04 LTS** from https://ubuntu.com/download/server. It's an `.iso` file.
2. Download **balenaEtcher** from https://etcher.balena.io.
3. In Etcher: **Flash from file** → pick the `.iso` → **Select target** → your USB stick → **Flash**.

### 1.2 Set up the PC's BIOS
1. Plug in the USB stick and turn the PC on. Right away, tap the BIOS key, usually **F2**, **Del**, **F12** or **Esc** (it shows briefly on screen).
2. Find these two settings and change them. Names vary by brand:
   - **Restore on AC Power Loss** / **After Power Failure** → **Power On**. The server then comes back by itself after a power cut.
   - **Boot order** → put the USB stick first. Some PCs have a one-time boot menu, often **F12**, which does the same thing.
3. Save and exit (usually **F10**).

### 1.3 Install Ubuntu
The installer is keyboard-only: arrow keys, Enter, and Tab.
1. Choose **Try or Install Ubuntu Server**.
2. Language and keyboard: pick yours.
3. Install type: **Ubuntu Server** (not "minimized").
4. Network: it should get an address over Ethernet automatically. **Write down the IP it shows**, for example `192.168.1.50`.
5. Proxy: leave empty. Mirror: leave the default.
6. Storage: **Use an entire disk**, then pick the PC's drive and confirm.
7. Profile: your name, server name `betterlift`, a username (for example `dylan`) and a **strong password**.
8. Ubuntu Pro: **Skip**.
9. **SSH: tick "Install OpenSSH server"**. This matters: it's how you control the PC from your other computer.
10. Featured snaps: select nothing.
11. When it finishes, remove the USB stick and choose **Reboot**.

### 1.4 Give the PC a fixed local IP
In your router's admin page (usually `192.168.1.1` or `192.168.0.1`, with the login printed on the router), find **DHCP reservation** / **Static lease** / **Address reservation**. Reserve the IP from step 1.3 for the `betterlift` PC, so the address never changes.

### 1.5 Connect from your main computer
From here on, you can unplug the server's monitor and keyboard. On your main computer, open a terminal (Windows: PowerShell; Mac: Terminal) and run:
```sh
ssh dylan@192.168.1.50
```
Use your own username and IP. Type `yes` the first time, then your password. **Every command below is run inside this SSH session.**

### 1.6 Update and basic security
```sh
sudo apt update && sudo apt upgrade -y
sudo apt install -y git unzip curl unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades     # choose "Yes": security updates install automatically
sudo ufw allow OpenSSH
sudo ufw enable                                     # type y
```
The firewall now blocks everything except SSH. The Cloudflare Tunnel only makes outgoing connections, so no other ports need to be open.

---

## Part 2: Install the backend (PocketBase)

### 2.1 Get the Better Lift code
```sh
sudo git clone https://github.com/yeoldawesome/BetterLift.git /opt/betterlift-src
```
If the repo is private, git asks you to log in. Your GitHub username is the username. For the password, use a **personal access token**: GitHub → Settings → Developer settings → Personal access tokens → *Tokens (classic)* → Generate, with the `repo` scope ticked.

### 2.2 Download PocketBase
```sh
sudo mkdir -p /opt/betterlift && cd /opt/betterlift
sudo curl -LO https://github.com/pocketbase/pocketbase/releases/download/v0.40.6/pocketbase_0.40.6_linux_amd64.zip
sudo unzip pocketbase_0.40.6_linux_amd64.zip pocketbase
sudo rm pocketbase_*.zip
```

### 2.3 Link in the app's database setup and server logic
```sh
sudo ln -s /opt/betterlift-src/pb/pb_migrations /opt/betterlift/pb_migrations
sudo ln -s /opt/betterlift-src/pb/pb_hooks /opt/betterlift/pb_hooks
```
- `pb_migrations` creates all the tables and the built-in exercises.
- `pb_hooks` is the server logic: PRs, permissions, notifications.
- Because these are links, a `git pull` later updates them automatically.

### 2.4 Create your admin account
```sh
cd /opt/betterlift
sudo ./pocketbase superuser upsert you@example.com 'a-long-password'
```
This is the login for the admin dashboard. It's separate from your in-app account.

### 2.5 Run PocketBase as a service
A service starts on boot and restarts if it crashes.
```sh
sudo useradd --system --home /opt/betterlift betterlift
sudo chown -R betterlift:betterlift /opt/betterlift
sudo cp /opt/betterlift-src/pb/deploy/betterlift-pb.service /etc/systemd/system/
sudo nano /etc/systemd/system/betterlift-pb.service
```
In the editor, change `https://app.example.com` to `https://app.yourdomain.com`. Save with **Ctrl+O**, **Enter**, then **Ctrl+X**. Then:
```sh
sudo systemctl daemon-reload
sudo systemctl enable --now betterlift-pb
sudo systemctl status betterlift-pb       # should say "active (running)". Press q to exit
curl http://127.0.0.1:8090/api/health     # should print "API is healthy"
```

---

## Part 3: Put your domain on Cloudflare

Skip this part if your domain already uses Cloudflare.

1. Go to https://dash.cloudflare.com → **Add a domain** → enter `yourdomain.com` → pick the **Free** plan.
2. Cloudflare scans your existing DNS records. Check they look right, then continue.
3. Cloudflare shows you **two nameservers**, for example `ada.ns.cloudflare.com`.
4. Log in where you bought the domain (Namecheap, GoDaddy, Porkbun, and so on). Find **Nameservers**, choose **Custom**, paste the two Cloudflare ones and save.
5. Wait for Cloudflare's "your domain is active" email. It usually takes minutes, at most 24 hours.

---

## Part 4: Cloudflare Tunnel (puts the backend online)

1. In the Cloudflare dashboard, open **Zero Trust** from the left menu. The first time, pick a team name and the **Free** plan; it may ask for a card but charges nothing.
2. Go to **Networks → Tunnels → Create a tunnel**.
3. Choose **Cloudflared**, name it `betterlift`, and save.
4. Under the install instructions, choose **Debian** and **64-bit**. Copy the command it shows; it ends in a long token. Paste and run it in your SSH session. It looks like:
   ```sh
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared.deb
   sudo cloudflared service install eyJhIjoi...your-token...
   ```
5. Back in the dashboard, the connector should show **Connected**. Click **Next**.
6. Add a **Public hostname**:
   - Subdomain: `api`
   - Domain: `yourdomain.com`
   - Service type: `HTTP`
   - URL: `localhost:8090`
7. Click **Save tunnel**. Cloudflare creates the DNS record automatically.

**Test:** on any device, open
- `https://api.yourdomain.com/api/health`. It should say **"API is healthy"**.
- `https://api.yourdomain.com/_/`. This is the admin dashboard; log in with your account from step 2.4.

---

## Part 5: Host the app on Cloudflare Pages

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git**.
2. Connect your GitHub account and choose the **BetterLift** repo.
3. Build settings:
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Environment variables** (Production): add
   - `VITE_API_URL` = `https://api.yourdomain.com`
   - `NODE_VERSION` = `22`
5. **Save and Deploy**. Wait a couple of minutes.
6. After it deploys, go to the project → **Custom domains → Set up a custom domain** → `app.yourdomain.com`. Cloudflare adds the DNS record for you.

From now on, **every push to `main` rebuilds and redeploys the app automatically**.

> Already using GitHub Pages instead? That works too. In GitHub, go to repo → Settings → Secrets and variables → Actions → **Variables**, add `VITE_API_URL = https://api.yourdomain.com`, and re-run the **Deploy** workflow. Then change the address in step 2.5 to your GitHub Pages address and run `sudo systemctl restart betterlift-pb`.

---

## Part 6: First-time setup in the dashboard

Open `https://api.yourdomain.com/_/` and go to **Settings**:

1. **Application**: set the app URL to `https://app.yourdomain.com`.
2. **Mail settings**: turn on SMTP so password-reset emails work. Free option, Gmail:
   - Make an **App password**: Google Account → Security → 2-Step Verification → App passwords.
   - Host `smtp.gmail.com`, port `587`, username = your Gmail address, password = the app password.
   - Click **Send test email** to check it.
3. **Backups**: turn on **auto backups**, for example daily, keeping 7.

**Make yourself a moderator** so you can review exercises other users submit:
1. Sign up in the app at `https://app.yourdomain.com`.
2. In the dashboard, open **users** → your user → turn on **is_moderator** → Save.

---

## Part 7: Install it on your phone

Open `https://app.yourdomain.com`:
- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** ⋮ menu → **Install app**.

---

## Updating Better Lift

When new code is merged to `main`, Cloudflare Pages updates the app by itself. To update the backend:
```sh
ssh dylan@192.168.1.50
cd /opt/betterlift-src && sudo git pull
sudo systemctl restart betterlift-pb
```
New database changes (migrations) apply automatically on restart, and existing data is kept.

**Updating PocketBase itself** (occasionally):
```sh
cd /opt/betterlift
sudo systemctl stop betterlift-pb
sudo curl -LO https://github.com/pocketbase/pocketbase/releases/download/vX.Y.Z/pocketbase_X.Y.Z_linux_amd64.zip
sudo unzip -o pocketbase_*.zip pocketbase && sudo rm pocketbase_*.zip
sudo chown betterlift:betterlift pocketbase
sudo systemctl start betterlift-pb
```

---

## Backups (don't skip this)

All your data lives in `/opt/betterlift/pb_data` on this one PC. If its drive dies without a backup, everything is gone.

- **Automatic:** the dashboard backups from Part 6 are saved into `pb_data/backups` on the **same drive**, so they protect against mistakes but not against the drive failing.
- **Copy them off the PC** now and then. From your main computer:
  ```sh
  scp -r dylan@192.168.1.50:/opt/betterlift/pb_data/backups ./betterlift-backups
  ```
  Or download one from the dashboard: **Settings → Backups → download**.
- **Restore:** in the dashboard, **Settings → Backups → Restore** (or upload a backup first).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `api.yourdomain.com` doesn't load | `sudo systemctl status cloudflared` and `sudo systemctl status betterlift-pb`. Both should say *active (running)*. Restart with `sudo systemctl restart <name>` |
| The app says it can't connect / network error | The address in `/etc/systemd/system/betterlift-pb.service` must exactly match where the app is hosted (`https://app.yourdomain.com`, no trailing `/`). After editing it, run `sudo systemctl daemon-reload && sudo systemctl restart betterlift-pb` |
| The app talks to the wrong server | `VITE_API_URL` in Cloudflare Pages is wrong or missing. Fix it, then **Deployments → Retry deployment** |
| Requests blocked or getting challenge pages | Cloudflare → your domain → **Security**: turn off *Bot Fight Mode* |
| Can't SSH in | The PC's IP changed (finish step 1.4), or the PC is off. Check the router's device list |
| See live backend logs | `sudo journalctl -u betterlift-pb -f` (Ctrl+C to stop) |
| See tunnel logs | `sudo journalctl -u cloudflared -f` |
| Disk space | `df -h /` |

## Limits to know about
- Each request through the Cloudflare Tunnel can be at most **100 MB**. Photo uploads and CSV imports are far below that.
- The server is only as reliable as your home power and internet. A cheap UPS (battery backup) helps with short power cuts.

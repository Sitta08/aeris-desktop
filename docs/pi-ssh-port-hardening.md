# Pi SSH hardening — move SSH off port 22

**Status:** deferred — do this near the end of the project, once the desktop
Terminal page has been fully tested against the default port.

**Why:** port 22 is the world-wide SSH default, so internet bots constantly scan
and brute-force it. Moving SSH to a non-standard port (e.g. **2222**) removes
almost all of that automated noise. It is not real security on its own (a
targeted attacker still finds it), but combined with a strong password / key
auth it meaningfully cuts log spam and drive-by attempts.

> ⚠️ Only matters if the Pi is ever reachable from outside the LAN (port
> forwarding, VPN, public IP). On a closed home/lab network it's optional. Do it
> anyway if you want the habit.

---

## Pi side — change the SSH port

1. Edit the SSH daemon config:

   ```bash
   sudo nano /etc/ssh/sshd_config
   ```

2. Find the line `#Port 22`, uncomment it and change it:

   ```
   Port 2222
   ```

3. If `ufw` (firewall) is active, open the new port BEFORE restarting SSH, or
   you can lock yourself out:

   ```bash
   sudo ufw allow 2222/tcp
   sudo ufw delete allow 22/tcp    # only after 2222 is confirmed working
   ```

4. Restart SSH:

   ```bash
   sudo systemctl restart ssh
   ```

5. **Keep the current terminal open.** From another machine, verify the new port
   works before closing it:

   ```bash
   ssh -p 2222 <user>@<pi-ip>
   ```

   If it fails, revert `Port` back to 22 in the still-open session and restart.

### Optional extra hardening (same file)

- `PermitRootLogin no` — never log in as root over SSH.
- `PasswordAuthentication no` — key-only auth (set up an SSH key first, or you
  lock yourself out).

---

## Desktop app side

Nothing structural to change — the Terminal page already has a **Port** field,
so you just type `2222` there instead of `22`.

Optional nicety: change the default port so you don't retype it each time.
- File: `src/renderer/src/pages/Terminal.tsx`
- Constant: `const DEFAULT_PORT = 22` → `2222`

The remembered-connection blob (localStorage `aeris.terminal.conn`) already
stores the port per user, so after connecting once on the new port it's
remembered anyway.

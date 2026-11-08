"""YouTube Data API + OAuth."""
import base64
import hashlib
import http.server
import json
import os
import secrets
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta, timezone

from .config import (
    YT_API, AUTH_URL, TOKEN_URL, SCOPE, CLIENT_PATH, TOKEN_PATH, APP_DIR, DEFAULT_INGEST,
)
from .util import load_json, save_json

class YTError(Exception):
    def __init__(self, msg, reason=""):
        super().__init__(msg)
        self.reason = reason


def http_json(method, url, data=None, headers=None, form=False):
    hdrs = dict(headers or {})
    body = None
    if data is not None:
        if form:
            body = urllib.parse.urlencode(data).encode()
            hdrs["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(data).encode()
            hdrs["Content-Type"] = "application/json"
    elif method == "POST":
        body = b""
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            err = json.loads(raw).get("error", raw)
        except Exception:
            err = raw
        reason, msg = "", str(err)
        if isinstance(err, dict):
            msg = err.get("message", msg)
            errs = err.get("errors") or [{}]
            reason = errs[0].get("reason", "")
        raise YTError(msg, reason)


class _Callback(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.result = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"<html><body style='font-family:sans-serif;padding:40px'>"
                         b"<h2>Signed in</h2>You can close this tab and go back to "
                         b"YT Stream Studio.</body></html>")

    def log_message(self, *args):
        pass


class YouTube:
    def client(self):
        for p in (CLIENT_PATH, os.path.join(APP_DIR, "client_secret.json")):
            d = load_json(p)
            c = d.get("installed") or d.get("web")
            if c and c.get("client_id") and c.get("client_secret"):
                return c["client_id"], c["client_secret"]
        return None

    def install_client(self, src):
        d = load_json(src)
        c = d.get("installed") or d.get("web")
        if not (c and c.get("client_id") and c.get("client_secret")):
            raise ValueError("That doesn't look like a Google OAuth client file.")
        shutil.copyfile(src, CLIENT_PATH)

    def has_token(self):
        return bool(load_json(TOKEN_PATH).get("refresh_token"))

    def sign_in(self):
        cred = self.client()
        if not cred:
            raise YTError("No OAuth client set up yet.", "noclient")
        cid, secret = cred
        server = http.server.HTTPServer(("127.0.0.1", 0), _Callback)
        server.result = None
        server.timeout = 30
        redirect = f"http://127.0.0.1:{server.server_address[1]}"
        verifier = secrets.token_urlsafe(64)
        challenge = base64.urlsafe_b64encode(
            hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        state = secrets.token_urlsafe(16)
        webbrowser.open(AUTH_URL + "?" + urllib.parse.urlencode({
            "client_id": cid, "redirect_uri": redirect, "response_type": "code",
            "scope": SCOPE, "code_challenge": challenge, "code_challenge_method": "S256",
            "state": state, "access_type": "offline", "prompt": "consent"}))
        deadline = time.time() + 180
        while time.time() < deadline and not (
                server.result and ("code" in server.result or "error" in server.result)):
            server.handle_request()
        server.server_close()
        res = server.result or {}
        if "code" not in res:
            raise YTError("Sign-in was cancelled or timed out. " + " ".join(res.get("error", [])))
        if res.get("state", [""])[0] != state:
            raise YTError("Sign-in check failed (state mismatch).")
        tok = http_json("POST", TOKEN_URL, form=True, data={
            "client_id": cid, "client_secret": secret, "code": res["code"][0],
            "code_verifier": verifier, "redirect_uri": redirect,
            "grant_type": "authorization_code"})
        save_json(TOKEN_PATH, {"access_token": tok["access_token"],
                               "refresh_token": tok.get("refresh_token", ""),
                               "expires_at": time.time() + tok.get("expires_in", 3600)})

    def token(self):
        tok = load_json(TOKEN_PATH)
        if tok.get("access_token") and time.time() < tok.get("expires_at", 0) - 60:
            return tok["access_token"]
        cred = self.client()
        if not (cred and tok.get("refresh_token")):
            raise YTError("Not signed in.", "nosignin")
        new = http_json("POST", TOKEN_URL, form=True, data={
            "client_id": cred[0], "client_secret": cred[1],
            "refresh_token": tok["refresh_token"], "grant_type": "refresh_token"})
        tok["access_token"] = new["access_token"]
        tok["expires_at"] = time.time() + new.get("expires_in", 3600)
        save_json(TOKEN_PATH, tok)
        return tok["access_token"]

    def api(self, method, path, params=None, body=None):
        url = YT_API + path + ("?" + urllib.parse.urlencode(params) if params else "")
        return http_json(method, url, data=body,
                         headers={"Authorization": "Bearer " + self.token()})

    def channel_name(self):
        r = self.api("GET", "channels", {"part": "snippet", "mine": "true"})
        items = r.get("items") or []
        if not items:
            raise YTError("This Google account has no YouTube channel.")
        return items[0]["snippet"]["title"]

    def ensure_stream(self):
        r = self.api("GET", "liveStreams", {"part": "id,snippet,cdn", "mine": "true",
                                            "maxResults": "50"})
        items = r.get("items", [])

        def usable(st):
            cdn = st.get("cdn", {})
            return (cdn.get("resolution") == "variable" and cdn.get("frameRate") == "variable"
                    and "ingestionInfo" in cdn)
        # 1) the stream this app made earlier (matched by title, so it is never duplicated),
        # 2) any other reusable variable stream EXCEPT the channel's default key: streaming
        #    to the default key makes Studio spawn its own separate, unused broadcast.
        pick = next((st for st in items if st.get("snippet", {}).get("title") == "YT Stream Studio"
                     and "ingestionInfo" in st.get("cdn", {})), None)
        if pick is None:
            pick = next((st for st in items if usable(st)
                         and not st.get("snippet", {}).get("isDefaultStream")), None)
        if pick is None:
            pick = self.api("POST", "liveStreams", {"part": "snippet,cdn,contentDetails"}, {
                "snippet": {"title": "YT Stream Studio"},
                "cdn": {"frameRate": "variable", "ingestionType": "rtmp", "resolution": "variable"},
                "contentDetails": {"isReusable": True}})
        info = pick["cdn"]["ingestionInfo"]
        return {"id": pick["id"], "key": info["streamName"], "address": info["ingestionAddress"]}

    @staticmethod
    def is_rate_limit(e):
        """True for YouTube's short-term 'too many requests' error (not the daily quota)."""
        return (getattr(e, "reason", "") in ("rateLimitExceeded", "userRateLimitExceeded")
                or "rate limit" in str(e).lower())

    def _with_retry(self, fn, say, delays=(4, 10, 20)):
        """Run fn(); on a rate-limit error wait and try again a few times."""
        for i in range(len(delays) + 1):
            try:
                return fn()
            except YTError as e:
                if not self.is_rate_limit(e) or i == len(delays):
                    raise
                say(f"YouTube says too many requests. Retrying in {delays[i]}s "
                    f"(attempt {i + 2} of {len(delays) + 1})...")
                time.sleep(delays[i])

    def find_reusable_broadcast(self, stream_id):
        """An unstarted broadcast already bound to this app's stream (e.g. left over from an
        earlier try). Returns its id, or None."""
        try:
            r = self.api("GET", "liveBroadcasts", {
                "part": "id,status,contentDetails", "broadcastStatus": "upcoming",
                "maxResults": "50"})
        except YTError:
            return None
        for b in r.get("items", []):
            if (b.get("contentDetails", {}).get("boundStreamId") == stream_id
                    and b.get("status", {}).get("lifeCycleStatus") in ("created", "ready")):
                return b["id"]
        return None

    def list_broadcasts(self):
        """Unfinished broadcasts (active + upcoming) on the signed-in channel, newest first.
        Two cheap list calls; no broadcast is created."""
        found = {}
        for status in ("active", "upcoming"):
            r = self.api("GET", "liveBroadcasts", {
                "part": "id,snippet,status,contentDetails", "broadcastStatus": status,
                "maxResults": "50"})
            for b in r.get("items", []):
                found[b["id"]] = b
        return sorted(found.values(),
                      key=lambda b: b.get("snippet", {}).get("scheduledStartTime", ""),
                      reverse=True)

    def use_broadcast(self, broadcast_id, stream_id, bound_stream_id, log=None):
        """Stream to an existing broadcast instead of creating one. If it's already bound to
        this app's stream nothing is sent to YouTube at all; otherwise it gets bound."""
        say = log or (lambda m: None)
        if bound_stream_id != stream_id:
            self._with_retry(lambda: self.api(
                "POST", "liveBroadcasts/bind",
                {"id": broadcast_id, "part": "id,contentDetails", "streamId": stream_id}), say)
        return broadcast_id

    def create_broadcast(self, title, privacy, stream_id, log=None):
        say = log or (lambda m: None)

        def insert():
            # recomputed on every attempt so the scheduled start is never in the past
            start = (datetime.now(timezone.utc) + timedelta(seconds=15)).strftime(
                "%Y-%m-%dT%H:%M:%S.000Z")
            return self.api("POST", "liveBroadcasts", {"part": "snippet,status,contentDetails"}, {
                "snippet": {"title": title, "scheduledStartTime": start},
                "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False},
                "contentDetails": {"enableAutoStart": True, "enableAutoStop": True,
                                   "monitorStream": {"enableMonitorStream": False}}})

        try:
            b = self._with_retry(insert, say)
        except YTError as e:
            if not self.is_rate_limit(e):
                raise
            old = self.find_reusable_broadcast(stream_id)
            if not old:
                raise
            say("YouTube keeps refusing new broadcasts, so I'm reusing your existing unstarted "
                "one. Its title and privacy stay as they were.")
            return old
        self._with_retry(lambda: self.api(
            "POST", "liveBroadcasts/bind",
            {"id": b["id"], "part": "id,contentDetails", "streamId": stream_id}), say)
        return b["id"]

    def stream_status(self, stream_id):
        """Return YouTube's current ingest status for the bound live stream."""
        r = self.api("GET", "liveStreams", {"part": "status", "id": stream_id})
        items = r.get("items") or []
        if not items:
            raise YTError("YouTube could not find the selected live stream.")
        status = items[0].get("status", {})
        return status.get("streamStatus", "unknown"), status.get("healthStatus", {})

    def transition(self, broadcast_id, status):
        return self.api("POST", "liveBroadcasts/transition",
                        {"broadcastStatus": status, "id": broadcast_id, "part": "status"})

    def start_broadcast(self, broadcast_id):
        """Explicitly transition a ready broadcast to live after ingest is active."""
        return self.transition(broadcast_id, "live")

    def broadcast_status(self, broadcast_id):
        """Return the broadcast lifecycle state (ready/liveStarting/live/etc.)."""
        r = self.api("GET", "liveBroadcasts", {"part": "status", "id": broadcast_id})
        items = r.get("items") or []
        if not items:
            raise YTError("YouTube could not find the created broadcast.")
        return items[0].get("status", {}).get("lifeCycleStatus", "unknown")

    def complete(self, broadcast_id):
        self.api("POST", "liveBroadcasts/transition",
                 {"broadcastStatus": "complete", "id": broadcast_id, "part": "status"})

    def update_title(self, broadcast_id, title):
        """Update the broadcast title while live or scheduled (snippet only)."""
        title = (title or "").strip() or "Live Stream"
        return self.api(
            "PUT", "liveBroadcasts",
            {"part": "snippet"},
            {"id": broadcast_id, "snippet": {"title": title}},
        )

    def watch_url(self, broadcast_id):
        if not broadcast_id:
            return ""
        return "https://www.youtube.com/watch?v=" + broadcast_id

    def sign_out(self):
        try:
            os.remove(TOKEN_PATH)
        except OSError:
            pass



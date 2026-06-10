"""Upload a base64 file to Cloudinary. Usage: python upload_cloudinary.py <b64file> <public_id> <out_json>"""
import sys, base64, hashlib, time, os, json
import urllib.request, urllib.parse

b64_file = sys.argv[1]
public_id = sys.argv[2]
out_json = sys.argv[3]

CLOUD_NAME = "dutg2rtvr"
API_KEY = "226785248494346"
API_SECRET = "6pX9f6a_QAFQmPriZDTCTgwtj0w"
FOLDER = "microblogs"

# Decode base64
with open(b64_file, 'r') as f:
    data = f.read().strip().strip('"')
if ',' in data:
    data = data.split(',', 1)[1]
img_bytes = base64.b64decode(data + '=' * (-len(data) % 4))

# Write temp file
temp = f"C:/tmp/{public_id}.png"
os.makedirs("C:/tmp", exist_ok=True)
with open(temp, 'wb') as f:
    f.write(img_bytes)

# Build signature
ts = int(time.time())
sign_str = f"folder={FOLDER}&public_id={public_id}&timestamp={ts}{API_SECRET}"
sig = hashlib.sha1(sign_str.encode()).hexdigest()

# Upload via multipart using requests if available, else curl
try:
    import requests
    with open(temp, 'rb') as f:
        resp = requests.post(
            f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/image/upload",
            files={"file": f},
            data={"api_key": API_KEY, "timestamp": ts, "signature": sig, "folder": FOLDER, "public_id": public_id}
        )
    result = resp.json()
except ImportError:
    import subprocess
    r = subprocess.run([
        "curl", "-s", "-X", "POST",
        "-F", f"file=@{temp}",
        "-F", f"api_key={API_KEY}",
        "-F", f"timestamp={ts}",
        "-F", f"signature={sig}",
        "-F", f"folder={FOLDER}",
        "-F", f"public_id={public_id}",
        f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/image/upload"
    ], capture_output=True, text=True)
    result = json.loads(r.stdout)

os.remove(temp)
with open(out_json, 'w') as f:
    json.dump(result, f)
print(result.get("secure_url", result.get("error", "unknown")))

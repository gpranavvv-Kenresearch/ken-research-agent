"""
Usage: python cloudinary_upload.py <b64_file> <public_id>
Uploads image to Cloudinary and prints secure_url.
"""
import sys, json, base64, subprocess, os, hashlib, time

b64_file = sys.argv[1]
public_id = sys.argv[2]

CLOUD_NAME = "dutg2rtvr"
API_KEY = "226785248494346"
API_SECRET = "6pX9f6a_QAFQmPriZDTCTgwtj0w"
FOLDER = "microblogs"

with open(b64_file, 'r') as f:
    data = json.load(f)

tmp = f"generated_images/{public_id}_{int(time.time())}.png"
os.makedirs("generated_images", exist_ok=True)
with open(tmp, 'wb') as f:
    f.write(base64.b64decode(data))

ts = str(int(time.time()))
sign_str = f"folder={FOLDER}&public_id={public_id}&timestamp={ts}{API_SECRET}"
sig = hashlib.sha1(sign_str.encode()).hexdigest()

result = subprocess.run([
    "curl", "-s", "-X", "POST",
    "-F", f"file=@{tmp}",
    "-F", f"api_key={API_KEY}",
    "-F", f"timestamp={ts}",
    "-F", f"signature={sig}",
    "-F", f"folder={FOLDER}",
    "-F", f"public_id={public_id}",
    f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/image/upload"
], capture_output=True, text=True)

resp = json.loads(result.stdout)
os.remove(tmp)

url = resp.get('secure_url', '')
if url:
    print(url)
else:
    print("ERROR: " + str(resp), file=sys.stderr)
    sys.exit(1)

import os
import re

repo_path = r"C:\Users\HomePC\lcpdfr_public"  # Edit to your cloned repo
output_lua = r"C:\Program Files (x86)\Steam\steamapps\common\Grand Theft Auto IV\GTACServer\resources\lcpdfr\server.lua"  # Append to server.lua

callout_lines = ["Callouts = {"]

missions_dir = os.path.join(repo_path, 'LCPD First Response', 'Engine', 'Scripting', 'Missions')
for root, _, files in os.walk(missions_dir):
  for file in files:
    if file.endswith('.cs'):
      code = open(os.path.join(root, file), 'r').read()
      id_match = re.search(r'ID\s*=\s*(\d+)', code)
      text_match = re.search(r'DisplayName\s*=\s*"(.*?)"', code)
      coords_match = re.search(r'new Vector3\s*$$ \s*(.+?)\s* $$', code)
      type_match = re.search(r'Type\s*=\s*CalloutType\.(.*?);', code)
      audio_match = re.search(r'Audio\s*=\s*"(.*?)"', code)
      suspects_match = re.search(r'Suspects\s*=\s*(\d+)', code)
      vehicles_match = re.search(r'Vehicles\s*=\s*(\d+)', code)

      if id_match:
        coords = coords_match.group(1).replace('f', '') if coords_match else '0,0,0'
        entry = f'{{id={id_match.group(1)}, text="[Scanner] {text_match.group(1) if text_match else "Unknown"}", coords={{{coords}}}, type="{type_match.group(1).lower() if type_match else "general"}", audio="{audio_match.group(1) if audio_match else "default.wav"}", suspects={suspects_match.group(1) if suspects_match else "1"}, vehicles={vehicles_match.group(1) if vehicles_match else "0"}}}'
        callout_lines.append(entry + ",")

callout_lines.append("}")

with open('callouts_generated.lua', 'w') as f:
  f.write('\n'.join(callout_lines))

print("Generated callouts_generated.lua – copy the Callouts table into server.lua, replacing the sample one.")
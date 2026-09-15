from PIL import Image
import os

src_path = r'c:\Users\Usuario\Documents\GitHub\App-para-Kioscos\assets\logokiosco.ico'
dest_assets = r'c:\Users\Usuario\Documents\GitHub\App-para-Kioscos\Kiosco-Electron\assets\logokiosco.ico'
dest_public = r'c:\Users\Usuario\Documents\GitHub\App-para-Kioscos\Kiosco-Electron\public\logokiosco.ico'

img = Image.open(src_path).convert('RGBA')
w, h = img.size

canvas_size = 256
ratio = min(canvas_size / w, canvas_size / h)
new_w = int(w * ratio)
new_h = int(h * ratio)
resized_img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
paste_x = (canvas_size - new_w) // 2
paste_y = (canvas_size - new_h) // 2
canvas.paste(resized_img, (paste_x, paste_y), resized_img)

sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
canvas.save(dest_assets, format='ICO', sizes=sizes)
canvas.save(dest_public, format='ICO', sizes=sizes)
print('Generated 256x256 Windows ICO successfully with multi-resolution layers.')

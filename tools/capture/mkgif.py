import glob, sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
fs = sorted(glob.glob(f"{src}/f_*.png"))[::2]
ims = [Image.open(f).convert('RGB').resize((480, 270), Image.NEAREST) for f in fs]
pal = ims[len(ims) // 2].quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
q = [im.quantize(palette=pal, dither=Image.Dither.NONE) for im in ims]
q[0].save(out, save_all=True, append_images=q[1:], duration=83, loop=0, optimize=False, disposal=1)
print(len(ims), "frames")

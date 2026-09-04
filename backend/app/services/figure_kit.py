"""
Çizim kiti — mekanik diyagramlar için hazır yapı taşları.

NEDEN VAR
Modelden serbest matplotlib kodu isteyip geometrik olarak doğru bir eğik
düzlem beklemek işe yaramıyor. Fonksiyon grafiklerinde başarılı, çünkü orada
hesabı matplotlib yapıyor (`ax.plot(x, f(x))`). Mekanik diyagramda ise dönme
açısı, temas noktası ve etiket konumlarını modelin kendisi hesaplaması
gerekiyor ve tutturamıyor: blok eğimin üstünde durmuyor, açı işareti köşeye
oturmuyor, ağırlık oku havada başlıyor.

Çözüm modeli kısıtlamak: geometriyi biz hesaplıyoruz, model yalnızca parametre
veriyor. `block_on_incline(ax, ramp, 2.0)` çağrısı bloğu HER ZAMAN eğimin
üstüne, doğru açıyla yerleştiriyor. Yanlış çizmesi mümkün değil.

Bu dosyanın kaynağı kum havuzuna kopyalanıp model kodundan önce çalıştırılıyor;
fonksiyonlar hazır olarak isim alanında bulunuyor.
"""

FIGURE_KIT_SOURCE = '''
from math import radians, cos, sin, degrees
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle, Arc, Polygon, FancyArrow
from matplotlib.transforms import Affine2D

LINE = "black"
FILL = "0.85"
LW = 1.6


def new_figure(width=4.6, height=3.0):
    """Diyagram için eksen açar. Ölçek eşit, çerçeve yok."""
    fig, ax = plt.subplots(figsize=(width, height))
    ax.set_aspect("equal")
    ax.axis("off")
    return fig, ax


def incline(ax, theta_deg, length=4.0, angle_label=None, ground=True):
    """
    Eğik düzlem çizer ve üzerine yerleştirme yapmak için gereken bilgiyi döner.

    Üçgen: (0,0) köşesinden başlar, taban sağa doğru gider, eğim sağ üste
    yükselir. Açı sol alt köşede.

    Dönen sözlükteki `point(s)` fonksiyonu, eğim boyunca s kadar ilerlemiş
    noktanın koordinatını veriyor — blok ve top yerleşimi bunu kullanıyor.
    """
    theta = radians(theta_deg)
    top = (length * cos(theta), length * sin(theta))

    ax.add_patch(
        Polygon(
            [(0, 0), (top[0], 0), top],
            closed=True,
            facecolor="none",
            edgecolor=LINE,
            linewidth=LW,
        )
    )

    if ground:
        # Zemin taralaması: yüzeyin sabit olduğunu gösteriyor.
        step = length / 14
        for i in range(15):
            x = i * step
            ax.plot([x, x - step * 0.6], [0, -step * 0.6], color=LINE, lw=0.9)
        ax.plot([-step * 0.6, top[0]], [0, 0], color=LINE, lw=LW)

    ramp = {
        "theta_deg": theta_deg,
        "theta": theta,
        "length": length,
        "top": top,
        "point": lambda s: (s * cos(theta), s * sin(theta)),
        "normal": (-sin(theta), cos(theta)),
    }

    if angle_label:
        angle_mark(ax, (0, 0), theta_deg, radius=length * 0.22, label=angle_label)

    return ramp


def block_on_incline(ax, ramp, distance, size=0.7, label=None, color=FILL):
    """
    Eğimin ÜZERİNE blok yerleştirir.

    distance: eğim boyunca alt köşeden itibaren mesafe.

    Blok tabanı yüzeye tam oturuyor: dikdörtgeni önce yatayda kurup açı kadar
    döndürüyor, sonra temas noktasına taşıyoruz. Model bunu elle yapmaya
    çalıştığında blok ya havada kalıyor ya eğimin içine gömülüyordu.
    """
    theta = ramp["theta"]
    cx, cy = ramp["point"](distance)
    height = size * 0.65

    rect = Rectangle(
        (-size / 2, 0), size, height,
        facecolor=color, edgecolor=LINE, linewidth=1.4,
    )
    rect.set_transform(
        Affine2D().rotate(theta).translate(cx, cy) + ax.transData
    )
    ax.add_patch(rect)

    # Blok merkezi: temas noktasından yüzey normali boyunca yarım yükseklik.
    nx, ny = ramp["normal"]
    centre = (cx + nx * height / 2, cy + ny * height / 2)

    if label:
        # Etiket bloğun İÇİNE değil dışına: "15 kg" gibi bir metin küçük bir
        # dikdörtgene sığmıyor, kenarlardan taşıp çizimi kirletiyordu.
        ax.annotate(
            label,
            (centre[0] + nx * size * 0.95, centre[1] + ny * size * 0.95),
            ha="center", va="center", fontsize=10,
        )

    return centre


def ball_on_incline(ax, ramp, distance, radius=0.32, label=None, color=FILL):
    """
    Eğimin üzerine küre yerleştirir.

    Küre yüzeye tek noktadan değiyor: merkez, temas noktasından yüzey normali
    boyunca yarıçap kadar uzakta.
    """
    cx, cy = ramp["point"](distance)
    nx, ny = ramp["normal"]
    centre = (cx + nx * radius, cy + ny * radius)

    ax.add_patch(
        Circle(centre, radius, facecolor=color, edgecolor=LINE, linewidth=1.4)
    )

    if label:
        ax.annotate(label, centre, ha="center", va="center", fontsize=9)

    return centre


def force_arrow(ax, start, angle_deg, length=1.0, label=None, color=LINE):
    """
    Kuvvet oku. angle_deg: 0 sağa, 90 yukarı, 270 aşağı.

    Ok her zaman verilen noktadan BAŞLIYOR — modelin sık yaptığı hata oku
    eksenden ya da havadan başlatmaktı.
    """
    angle = radians(angle_deg)
    dx, dy = length * cos(angle), length * sin(angle)

    ax.annotate(
        "",
        xy=(start[0] + dx, start[1] + dy),
        xytext=start,
        arrowprops=dict(arrowstyle="-|>", color=color, lw=1.6,
                        mutation_scale=14),
    )

    if label:
        # Etiket okun YANINDA, ucunun ötesinde değil. Ucun ötesine koymak aşağı
        # bakan oklarda etiketi zemine bindiriyordu.
        px, py = -sin(angle), cos(angle)  # oka dik yön
        ax.annotate(
            label,
            (start[0] + dx * 0.55 + px * 0.32,
             start[1] + dy * 0.55 + py * 0.32),
            ha="center", va="center", fontsize=10, color=color,
        )


def weight_arrow(ax, point, length=1.0, label="mg"):
    """Ağırlık oku: cismin merkezinden dik aşağı."""
    force_arrow(ax, point, 270, length, label)


def angle_mark(ax, vertex, theta_deg, radius=0.6, label=None):
    """
    Açı yayı ve etiketi. Yay köşeye oturuyor, etiket yayın ortasında.
    """
    ax.add_patch(
        Arc(vertex, 2 * radius, 2 * radius, angle=0,
            theta1=0, theta2=theta_deg, color=LINE, lw=1.2)
    )

    if label:
        mid = radians(theta_deg / 2)
        ax.annotate(
            label,
            (vertex[0] + radius * 1.45 * cos(mid),
             vertex[1] + radius * 1.45 * sin(mid)),
            ha="center", va="center", fontsize=10,
        )


def beam(ax, length=4.0, height=0.22, label=None):
    """Yatay kiriş. Mesnetler için support() kullan."""
    ax.add_patch(
        Rectangle((0, 0), length, height,
                  facecolor=FILL, edgecolor=LINE, linewidth=1.4)
    )
    if label:
        ax.annotate(label, (length / 2, height + 0.28),
                    ha="center", fontsize=10)
    return {"length": length, "height": height}


def support(ax, x, kind="pin", size=0.32):
    """
    Mesnet. kind: "pin" (sabit, üçgen) veya "roller" (hareketli, üçgen+daire).
    """
    ax.add_patch(
        Polygon([(x, 0), (x - size, -size * 1.5), (x + size, -size * 1.5)],
                closed=True, facecolor="none", edgecolor=LINE, linewidth=1.4)
    )
    if kind == "roller":
        for offset in (-size * 0.5, size * 0.5):
            ax.add_patch(
                Circle((x + offset, -size * 1.5 - size * 0.28), size * 0.28,
                       facecolor="none", edgecolor=LINE, linewidth=1.2)
            )
    else:
        step = size / 2
        for i in range(-2, 3):
            ax.plot([x + i * step, x + i * step - step * 0.6],
                    [-size * 1.5, -size * 1.5 - step * 0.6],
                    color=LINE, lw=0.9)


def dimension(ax, start, end, label, offset=0.4):
    """İki nokta arası ölçü oku ve etiketi."""
    sx, sy = start
    ex, ey = end
    ax.annotate("", xy=(ex, ey - offset), xytext=(sx, sy - offset),
                arrowprops=dict(arrowstyle="<->", color=LINE, lw=1.1))
    ax.annotate(label, ((sx + ex) / 2, (sy + ey) / 2 - offset - 0.18),
                ha="center", va="top", fontsize=9)


def finish(ax, margin=0.6):
    """Çizimi tamamlar: kenar payı bırakır, ölçeği sabitler."""
    ax.set_aspect("equal")
    ax.axis("off")
    ax.margins(margin)
    ax.relim()
    ax.autoscale_view()
'''
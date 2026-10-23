"""Lecture du prix dans le HTML d'une page produit — fonctions pures, sans réseau.

Ordre des sources : données structurées schema.org (JSON-LD), puis balises meta,
puis un sélecteur CSS par enseigne (lu par le navigateur, voir releve.py).
"""
import json
import re
from html.parser import HTMLParser

RE_PRIX = re.compile(r"(\d{1,4})\s*(?:[.,]\s*(\d{1,2})|€\s*(\d{2}))")
RE_EAN = re.compile(r"(?<!\d)(\d{13})(?!\d)")
MARQUEURS_BLOCAGE = ("captcha", "datadome", "cf-challenge", "challenge-platform", "access denied",
                     "accès refusé", "acces refuse", "are you a robot", "êtes-vous un robot", "px-captcha")


def nombre_prix(texte):
    """« 1,89 € », « 1€89 », « 3.79 » -> 1.89 ; None si aucun prix lisible."""
    if texte is None:
        return None
    if isinstance(texte, (int, float)):
        return float(texte)
    m = RE_PRIX.search(str(texte).replace("\xa0", " "))
    if not m:
        t = str(texte).strip()
        return float(t) if t.isdigit() else None
    cents = m.group(2) or m.group(3) or "0"
    return round(int(m.group(1)) + int(cents.ljust(2, "0")) / 100, 2)


def ean_depuis_url(url):
    """Code-barres à 13 chiffres présent dans le lien (Carrefour), sinon None."""
    m = RE_EAN.search(url or "")
    return m.group(1) if m else None


class _Lecteur(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.jsonld, self.meta, self.titre = [], {}, ""
        self._dans_jsonld = self._dans_titre = False
        self._tampon = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "script" and (a.get("type") or "").lower() == "application/ld+json":
            self._dans_jsonld, self._tampon = True, []
        elif tag == "title":
            self._dans_titre = True
        elif tag == "meta":
            cle = a.get("itemprop") or a.get("property") or a.get("name")
            if cle and a.get("content"):
                self.meta.setdefault(cle.lower(), a["content"])

    def handle_endtag(self, tag):
        if tag == "script" and self._dans_jsonld:
            self.jsonld.append("".join(self._tampon))
            self._dans_jsonld = False
        elif tag == "title":
            self._dans_titre = False

    def handle_data(self, data):
        if self._dans_jsonld:
            self._tampon.append(data)
        elif self._dans_titre:
            self.titre += data


def _objets(valeur):
    """Parcourt récursivement un JSON-LD (listes, @graph) et rend chaque objet."""
    if isinstance(valeur, list):
        for v in valeur:
            yield from _objets(v)
    elif isinstance(valeur, dict):
        yield valeur
        for v in valeur.values():
            if isinstance(v, (list, dict)):
                yield from _objets(v)


def _est(obj, type_):
    t = obj.get("@type")
    return type_ in (t if isinstance(t, list) else [t])


def _depuis_offre(offre):
    """(prix, prix_barre) d'une Offer / AggregateOffer schema.org."""
    prix = nombre_prix(offre.get("price") if offre.get("price") is not None else offre.get("lowPrice"))
    barre = None
    specs = offre.get("priceSpecification")
    for s in specs if isinstance(specs, list) else [specs] if isinstance(specs, dict) else []:
        p = nombre_prix(s.get("price"))
        if p is None:
            continue
        if "strikethrough" in str(s.get("priceType", "")).lower() or "listprice" in str(s.get("priceType", "")).lower():
            barre = p
        elif prix is None:
            prix = p
    if barre is not None and prix is not None and barre <= prix:
        barre = None
    return prix, barre


def prix_depuis_html(html):
    """{prix, prix_barre, source, ean, titre} lus dans la page ; prix None si introuvable."""
    lecteur = _Lecteur()
    lecteur.feed(html or "")
    res = {"prix": None, "prix_barre": None, "source": None, "ean": None, "titre": lecteur.titre.strip()}
    for bloc in lecteur.jsonld:
        try:
            donnees = json.loads(bloc)
        except ValueError:
            continue
        for obj in _objets(donnees):
            if not _est(obj, "Product"):
                continue
            res["ean"] = res["ean"] or obj.get("gtin13") or obj.get("gtin") or obj.get("gtin14")
            offres = obj.get("offers")
            for offre in offres if isinstance(offres, list) else [offres] if isinstance(offres, dict) else []:
                prix, barre = _depuis_offre(offre)
                if prix is not None:
                    res.update(prix=prix, prix_barre=barre, source="jsonld")
                    return res
    for cle in ("price", "product:price:amount", "og:price:amount"):
        prix = nombre_prix(lecteur.meta.get(cle))
        if prix is not None:
            res.update(prix=prix, source="meta")
            return res
    return res


RE_TITRE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
TITRES_BLOCAGE = ("403", "429", "interdit", "forbidden", "access denied", "accès refusé", "just a moment",
                  "interruption temporaire")


def page_bloquee(html, statut_http=None):
    """Vrai si la page est un écran anti-robot plutôt qu'une page produit.
    Certains sites (Joybuy) renvoient un statut 200 avec un titre « 403 Interdit »."""
    if statut_http in (401, 403, 429):
        return True
    t = (html or "")[:20000].lower()
    m = RE_TITRE.search(t)
    if m and any(x in m.group(1) for x in TITRES_BLOCAGE):
        return True
    return any(x in t for x in MARQUEURS_BLOCAGE)

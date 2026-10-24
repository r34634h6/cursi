# Der Code erschafft dich

Eine lokale Seite. Die Kamera bleibt im Browser: dein Bild wird live aus fallendem Code geschrieben und steht als leuchtende Figur in einem grünen Korridor.

## Start

Im Projektordner:

```bash
python3 serve.py
```

Öffne [http://localhost:4173](http://localhost:4173). Wenn der Browser dort einen Fehler zeigt, nimm [http://127.0.0.1:4173](http://127.0.0.1:4173).

`python3 -m http.server` reicht nicht: der hört nur auf IPv4, und Safari bricht bei `localhost` ab, weil zuerst die IPv6-Adresse `::1` probiert wird.

Die Vorschau ohne Kamera zeigt denselben Effekt mit einer Silhouette. Nichts wird gespeichert oder gesendet.

Die Zeichen stammen aus Untergruppen von Droid Sans Fallback (Google) und JetBrains Mono. Lizenzen stehen in `fonts/NOTICE.txt`.

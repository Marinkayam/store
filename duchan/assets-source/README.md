# מקורות התמונות

הקבצים כאן הם **המקור**, לא מה שהאתר מגיש. הם גדולים בכוונה (1–2MB
לתמונה) כדי שאפשר יהיה לייצר מהם גדלים חדשים בעתיד בלי לאבד איכות.

`assets-source/` אינה מוגשת על ידי Next — רק `public/` מוגשת. שום
משתמשת לא מורידה את הקבצים האלה.

## מה מיוצר ממה

| מקור | מה שמוגש | גודל |
|---|---|---|
| `squish/placeholder.png` | `public/squish-placeholder.webp` | 42KB |
| `squish/logo-animated.gif` | `public/squish-logo.webp` (פריים ראשון) | 60KB |
| `squish/{bao,strawberry,jellyfish,cheese}.png` | `public/demo/*.webp` | 46–124KB |
| `squish/{icecube,butter}.png` | עדיין לא בשימוש | — |

## לייצר מחדש

```bash
node -e "
const sharp=require('sharp');
sharp('assets-source/squish/bao.png').trim({threshold:1})
  .resize(600,600,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}})
  .webp({quality:80}).toFile('public/demo/bao.webp');
"
```

`trim` מסיר את השוליים השקופים, ו-`fit:'contain'` שומר על הפרופורציות
בתוך ריבוע — הכרטיס בגלריה הוא ריבוע, ותמונה שנחתכת לריבוע מאבדת את
הקצוות של הסקווישי.

## הלוגו המונפש

`logo-animated.gif` הוא 60 פריימים, ומשקלו כ-500–780KB בכל פורמט
שניסיתי. מסך הפתיחה נטען אצל כל מי שנכנסת, ולכן מוגש ממנו **הפריים
הראשון בלבד** — 60KB. אם בעתיד יוחלט שההנפשה שווה את זה, הפקודה היא:

```bash
node -e "
require('sharp')('assets-source/squish/logo-animated.gif',{animated:true})
  .resize({width:300}).webp({quality:45,effort:6}).toFile('public/squish-logo.webp');
"
```

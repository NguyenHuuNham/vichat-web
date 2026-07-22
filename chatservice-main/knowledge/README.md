# Knowledge data

`songhong-default.json` is a small seed set used to verify the chatbot after a
fresh deployment. Replace it with your own JSON or add documents through the
knowledge REST API. The expected JSON shape is:

```json
{
  "base": {"code": "company", "name": "Company knowledge"},
  "documents": [{"title": "FAQ", "content": "..."}]
}
```

Seed it with:

```powershell
python scripts\seed_knowledge.py --file knowledge\your-data.json
```

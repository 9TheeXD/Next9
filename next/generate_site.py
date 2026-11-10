# The member pages (/member/, /member/<dept>/, /member/grade/, /member/profile/<slug>.html) are now
# rendered by the Next.js app in web/ straight from members.json on R2, on every request, so an edit
# saved in the editor shows up on the next page load. Nothing needs generating any more; this script
# stays because the editor's "generate" button (POST /api/generate-site) still runs it.
print("Member pages are rendered live by the Next.js app; nothing to generate.")

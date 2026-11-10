import os

path = "mobile-app/src/contexts/AuthContext.tsx"
with open(path, "r") as f:
    content = f.read()

# Fix Task 1: Clear cache on 401/404
old_catch = "} catch {"
new_catch = "} catch (err: any) {\n      if (err.message && (err.message.includes('401') || err.message.includes('404') || err.message.includes('User not found'))) {\n        setUser(null);\n        await clearToken();\n        await AsyncStorage.removeItem(OFFLINE_USER_KEY);\n        return;\n      }"

content = content.replace(old_catch, new_catch)

with open(path, "w") as f:
    f.write(content)


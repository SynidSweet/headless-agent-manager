# Page snapshot

```yaml
- generic [ref=e5]:
  - complementary [ref=e6]:
    - generic [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e9]: CS
        - generic [ref=e10]:
          - heading "CodeStream" [level=1] [ref=e11]
          - paragraph [ref=e12]: AI Agent Console
      - generic [ref=e14]:
        - heading "Launch New Agent (v2.0)" [level=2] [ref=e15]
        - generic [ref=e16]:
          - generic [ref=e17]:
            - generic [ref=e18]: "Agent Type:"
            - combobox "Agent Type:" [ref=e19]:
              - option "Claude Code" [selected]
              - option "Gemini CLI"
          - generic [ref=e20]:
            - generic [ref=e21]: "Prompt:"
            - textbox "Prompt:" [ref=e22]:
              - /placeholder: Enter your prompt for the agent...
          - generic [ref=e23]:
            - generic [ref=e24]: "Working Directory:"
            - textbox "Working Directory:" [ref=e25]:
              - /placeholder: /path/to/project (optional)
          - button "Launch Agent" [ref=e26] [cursor=pointer]
      - generic [ref=e27]:
        - heading "Active Agents (0)" [level=3] [ref=e28]
        - paragraph [ref=e29]: No active agents
      - generic [ref=e30]:
        - heading "Historic Agents (1)" [level=3] [ref=e31]
        - button "Respond with exactly \"DEDUP_TE..." [ref=e32]:
          - paragraph [ref=e35]: Respond with exactly "DEDUP_TE...
  - main [ref=e36]:
    - generic [ref=e38]:
      - generic [ref=e39]: terminal
      - paragraph [ref=e40]: Select an agent or start a new one
```
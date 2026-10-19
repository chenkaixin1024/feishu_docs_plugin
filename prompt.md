写一个 Chrome 浏览器插件，功能和交互如下：
1. 在打开飞书文档时可用，飞书文档的链接为：*feishu.cn/*，非此链接下弹窗提示插件不可用。
2. 核心功能是根据文档内容，提供`对话`、`总结`（包括`概要`、`精读`和`思维导图`）功能。
3. 插件以 sidebar 形式呈现
4. 核心功能实现逻辑：
    - 唤醒插件后，根据链接获取当前打开文档的 doc_token，规则为`*/docx/{doc_token}*`或`*/wiki/{doc_token}*`，doc_token形如`B4EPdAYx8oi8HRxgPQQbM15UcBf`，22-27个字符
    - 然后调用飞书 API 接口，获取文档内容，请求和返回示例如下
      ```请求示例
      curl -i -X GET 'https://open.feishu.cn/open-apis/docs/v1/content?content\_type=markdown&doc\_token=B4EPdAYx8oi8HRxgPQQbM15UcBf&doc\_type=docx&lang=zh' \\ -H 'Authorization: Bearer t-7f1b\*\*\*\*\*\*8e560'
      
      ```

      ```返回示例
      {
        "code": 0,
        "msg": "success",
        "data": {
            "content": "# Markdown Export Example Document\n\n# ..."
        }
      }
      ```
    - 使用接口返回的文档内容作为上下文，调用大模型 API 完成插件的功能

5. 各子功能实现和交互
    - `对话`和`总结`以标签形式呈现，`总结`标签下包含`概要`、`精读`和`思维导图`三个子标签
    - 对话功能：以`prompt.js`中`chat_prompt`的值作为系统提示，获取到的文档内容作为常驻上下文，用户可以提出任意问题获取回复，支持多轮对话，流式响应
    - 概要功能：以`prompt.js`中变量`summray_prompt`的值为系统提示，对文档内容进行总结，流式响应。切换到总结标签下时默认显示概要，点击标签即激活功能；
    - 精读功能：以`prompt.js`中变量`fine_prompt`的值为系统提示，对文档内容进行精细总结，点击标签即激活功能；
    - 思维导图功能：以`prompt.js`中变量`mindmap_prompt`的值为系统提示，将文档内容提炼为思维导图，使用 markmap 或其他三方库在插件边栏页面中流式显示思维导图（即根据模型返回实时渲染分支）
6. 各项 Key 的获取
    - 提供一个配置页面，要求用户输入飞书应用的app_id和app_secret，以及大模型的 base_url、model_name 和 API_KEY。
    - 飞书文档内容获取需要的Authorization值，通过以下接口获取，请求和返回示例：
        ```请求示例
      curl -i -X POST 'https://open.feishu.cn/open-apis/auth/v3/tenant\_access\_token/internal' \\ -H 'Content-Type: application/json' \\ -d '{ "app\_id": "cli\_slkdjalasd***", "app\_secret": "dskLLdkasd***KK" }'

        ```
        ```返回示例
      {
          "code": 0,
          "msg": "ok",
          "tenant_access_token": "t-caecc734c2e3328a62489fe0648c4b98779*****",
          "expire": 7200
      }

        ```
7. UI和视觉
    - 使用类似 Shadcn/ui 风格的极简样式，但不要引入这些模块，使用纯 CSS 实现
    - 黑（#1E1E1E）白（#FFFFFF）灰（#EFEFEF）三色，不要其他颜色

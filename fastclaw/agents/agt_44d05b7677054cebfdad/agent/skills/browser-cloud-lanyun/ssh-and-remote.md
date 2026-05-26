# SSH 凭据获取与远程操作

## 一、SSH 凭据获取

### 方法 A：通过实例列表 API 获取（推荐 ⭐）

蓝耘的 `/api/d/user_ins/list` API 直接返回明文 SSH 凭据，不需要任何拦截技巧：

```javascript
const insRes = await page.evaluate(async (h) => {
  const r = await fetch('/api/d/user_ins/list?pageNum=1&pageSize=10&search=&runStatus=&payType=', { headers: h });
  return r.json();
}, headers);

const instance = insRes.data[0];
// instance.sshAddr = "qhdlink.lanyun.net"
// instance.sshPort = 12528
// instance.sshAccount = "root"
// instance.sshPwd = "jpu95zd3lp6tqo68"  (明文！)
```

**优点**：不需要浏览器交互，API 直接返回，100% 可靠。

### 方法 B：Clipboard 拦截法（旧方案，备用）

实例列表页面的 SSH 和密码显示为 `*******`，DOM 中没有真实值。通过 JS 拦截 clipboard 获取：

```javascript
// 1. 注入 clipboard 拦截
await page.evaluate(() => {
  const origWrite = navigator.clipboard.writeText;
  window.__capturedClipboard = [];
  navigator.clipboard.writeText = async (text) => {
    window.__capturedClipboard.push(text);
    return origWrite.call(navigator.clipboard, text);
  };
});

// 2. 点击 SSH 按钮（通过 JS evaluate，不用 Playwright click）
await page.evaluate(() => {
  document.querySelectorAll('*').forEach(el => {
    if (el.textContent.trim() === 'SSH') {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) el.click();
    }
  });
});

// 3. 读取拦截到的内容
const captured = await page.evaluate(() => window.__capturedClipboard);
```

## 二、SSH 连接方案

### Windows 环境（推荐 paramiko）

Windows 没有 sshpass，不能直接用命令行传密码。使用 Python paramiko：

```python
import paramiko

def ssh_exec(host, port, username, password, command, timeout=15):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=username, password=password, timeout=timeout)
    stdin, stdout, stderr = ssh.exec_command(command)
    result = stdout.read().decode()
    error = stderr.read().decode()
    ssh.close()
    return result, error

# 使用
result, error = ssh_exec(
    'qhdlink.lanyun.net', 12528, 'root', 'jpu95zd3lp6tqo68',
    'nvidia-smi && python3 --version'
)
print(result)
```

### Linux/WSL 环境（sshpass）

```bash
sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no -p PORT root@HOST 'command'
```

## 三、容器环境特点

蓝耘容器实例的环境：
- 系统盘：30GB overlay（只读层 + 写层）
- 数据盘：50GB（可扩容至 ~35TB）
- 预装 miniconda：`/root/miniconda/`
- 数据盘挂载：`/root/lanyun-fs/`（持久存储，关机不丢）
- 临时目录：`/root/lanyun-tmp/`（关机会清空）
- 公共数据：`/root/lanyun-pub/`（共享只读数据集）

**⚠️ 重要**：
- 代码和数据放 `/root/lanyun-fs/` 或数据盘，**不要放系统盘**
- 系统盘写层有限，大文件会撑满
- 关机后系统盘写层会清空（数据盘不会）

## 四、pip 踩坑

蓝耘容器内 pip 可能指向系统 Python 而非 conda 环境：

```bash
# 正确方式：先激活 conda
source /root/miniconda/etc/profile.d/conda.sh
conda activate base
which pip    # 确认是 /root/miniconda/bin/pip
pip install xxx

# 或者用绝对路径
/root/miniconda/bin/pip install xxx
```

---
name: gpu-deploy-pitfalls
description: GPU 机箱部署踩坑速查。记录论文复现/环境部署中遇到的高频陷阱与解决方案。与 local-gpu-deploy 配合使用，作为其踩坑记录的补充。触发场景：遇到 PyTorch 版本安装、HuggingFace 下载、uv 超时、数据集格式转换等问题时查阅。
---

# GPU 机箱部署踩坑速查

## 1. PyTorch 历史版本安装

- **必须**先从 [Previous PyTorch Versions](https://pytorch.org/get-started/previous-versions/) 页面确认对应 CUDA 版本的正确安装命令（含 `--extra-index-url`），再执行安装。禁止凭记忆拼命令。
- 示例：torch==1.11.0+cu113 的正确命令：
  ```bash
  uv pip install torch==1.11.0+cu113 torchvision==0.12.0+cu113 torchaudio==0.11.0 --extra-index-url https://download.pytorch.org/whl/cu113
  ```
- CUDA Driver 版本（nvidia-smi 显示）≠ CUDA Toolkit 版本（nvcc），PyTorch wheel 的 cu 标记对应编译时的 CUDA Toolkit 版本，Driver 向下兼容。

## 2. HuggingFace 模型下载（国内机箱）

国内机箱无法直连 huggingface.co，需用镜像：

```bash
# 方法1（推荐）：huggingface-cli + hf-mirror，速度快
export HF_ENDPOINT=https://hf-mirror.com
huggingface-cli download <model_id> <filename> --local-dir ./local_path --local-dir-use-symlinks False

# 方法2：wget 从 hf-mirror 逐文件下载
# URL 格式：https://hf-mirror.com/<model_id>/resolve/main/<filename>

# 方法3（不推荐）：git clone + git lfs，LFS xet 存储域名可能无法解析
```

**注意**：
- `transformers<=4.21` 不支持 `HF_ENDPOINT` 环境变量，`from_pretrained()` 不会自动走镜像
- `modelscope` Python SDK 与 Python 3.8 不兼容（`list[int]` 语法需 3.9+），Python 3.8 环境下不可用
- 下载后用 `from_pretrained("./local_path")` 从本地加载，绕过网络问题

## 3. uv pip 安装超时

- 默认 `UV_HTTP_TIMEOUT=30s`，国内网络经常不够
- **必须**设置 `export UV_HTTP_TIMEOUT=300`（5分钟），复杂依赖甚至需要 `600`
- 若仍超时，分批安装：先核心包（transformers/opencv/lmdb），大包（timm/tensorboard/wandb）单独装

## 4. 项目 utils.py 顶层 import 导致脚本不可用

部分论文代码的 `utils.py` 顶层 import 了 tensorflow 等重依赖，但实际只用其中某个函数（如 CTC beam search 解码）。解决方法（按优先级）：

1. **Lazy import（推荐）**：将 `import tensorflow as tf` 改为 try/except 延迟加载，并在使用 tf 的函数内加保护：
   ```python
   # utils.py 顶部
   try:
       import tensorflow as tf
   except ImportError:
       tf = None
   
   # 使用 tf 的函数内
   def ctc_decode(...):
       if tf is None:
           raise ImportError('tensorflow required for ctc_decode but not installed')
       ...
   ```
   优点：训练阶段不需要 tf 时完全无感，评估阶段再装 tf 即可。

2. 写独立脚本，只复制需要的函数定义，绕过不需要的 import

3. 安装 tensorflow-cpu（轻量版），但国内网络下载可能超时（包 ~400MB），且 Python 3.8 需指定 `tensorflow-cpu==2.9.1`

## 5. Phoenix-2014 数据集格式转换

Phoenix-2014 原始标注是 CSV 格式（`|` 分隔），而 GFSLT-VLP 等代码需要 gzip+pickle 格式的 labels 文件。转换要点：

- CSV 字段：`id|folder|signer|annotation`（annotation 是 gloss）
- Phoenix-2014 没有 text（德语翻译），只有 gloss；Phoenix-2014T 才有 text
- pickle 格式：`dict[key] = {name, gloss, text, length, imgs_path}`
- imgs_path 格式：`split/video_name/imagesXXXX.png`
- 转换脚本需遍历 fullFrame 目录统计帧数

## 6. tar.gz 文件实际格式不符

OpenDataLab 下载的 `phoenix-2014.v3.tar.gz` 实际是未压缩的 POSIX tar archive（`file` 命令可确认），用 `tar xzf` 会报 `not in gzip format`。解决：用 `tar xf`（不加 `z`）。

## 7. 数据集软链接方向

```bash
# 正确方向：代码目录 → 数据盘实际位置
ln -sfn /mnt/sda/Datasets/Phoenix2014T/.../fullFrame-210x260px ./data/PHOENIX-2014-T/fullFrame-210x260px
```

- 用 `ln -sfn` 覆盖已有链接
- 软链接后用 `ls -la` 确认指向正确

## 8. gzip 压缩的 pickle 标签文件

部分论文代码（如 GFSLT-VLP）用 `gzip.open(filename, "rb")` + `pickle.load()` 读取标签文件。这些文件虽然无 `.gz` 后缀，但实际是 gzip 压缩的。

- **切勿盲目解压**：`file` 命令显示 `gzip compressed data` 时，先确认代码的读取方式
- 若误解压后需恢复：`gzip <filename>` 再 `mv <filename>.gz <filename>`（去掉 .gz 后缀恢复原名）
- 验证方法：`python -c "import gzip, pickle; d = pickle.load(gzip.open('labels.train','rb')); print(len(d))"`

## 9. uv venv 没有 pip

`uv venv` 创建的虚拟环境不含 pip（`python -m pip` 报 `No module named pip`），且 Python 3.8 的 `get-pip.py` 需用专用 URL。

解决方案（按优先级）：
1. **从系统 site-packages 复制**（最快，适合轻量包）：
   ```bash
   # 找到系统 Python 安装位置
   pip3 show <package> | grep Location
   # 复制到 venv site-packages
   cp -r /home/user/.local/lib/python3.8/site-packages/<package>* .venv/lib/python3.8/site-packages/
   ```
2. **安装 pip 到 venv**（适合后续还需装多个包）：
   ```bash
   # Python 3.8 必须用专用 URL（主站 get-pip.py 要求 3.10+）
   wget https://bootstrap.pypa.io/pip/3.8/get-pip.py
   .venv/bin/python get-pip.py
   ```
3. **用系统 pip 安装到 venv**（需 venv 有 pip，不适用）

## 10. SSH 中 pip 安装到错误 Python 环境

SSH 远程执行 `source .venv/bin/activate && pip install xxx` 时，`pip` 可能仍是系统 pip（shell 初始化顺序问题），包装到系统 Python 而非 venv。

解决方法：
- 用绝对路径：`.venv/bin/python -m pip install xxx`（但 venv 可能没有 pip，见 §9）
- 或先 `which pip` 确认路径
- 安装后用 `.venv/bin/python -c "import xxx; print(xxx.__file__)"` 验证包是否在 venv 内

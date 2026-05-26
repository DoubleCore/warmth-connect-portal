#!/bin/bash
# ============================================================
# SGC (Simplifying Graph Convolutional Networks) 一键部署脚本
# 目标设备：RTX 3090 Workstation (100.118.101.101)
# GitHub: https://github.com/Tiiiger/SGC
# ============================================================

set -e

echo "=========================================="
echo "  SGC 部署脚本 - Simplifying Graph Convolutional Networks"
echo "=========================================="

# ---- 配置 ----
WORK_DIR="$HOME/projects/SGC"
CONDA_ENV_NAME="sgc"
PYTHON_VERSION="3.9"

# ---- Step 1: 检查 GPU ----
echo ""
echo "[1/6] 检查 GPU..."
if command -v nvidia-smi &>/dev/null; then
    nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
    echo "✅ GPU 检测完成"
else
    echo "⚠️  nvidia-smi 未找到，请确认 NVIDIA 驱动已安装"
    exit 1
fi

# ---- Step 2: 克隆代码 ----
echo ""
echo "[2/6] 克隆 SGC 代码仓库..."
mkdir -p "$HOME/projects"
if [ -d "$WORK_DIR" ]; then
    echo "⚠️  目录 $WORK_DIR 已存在，跳过克隆"
else
    git clone https://github.com/Tiiiger/SGC.git "$WORK_DIR"
    echo "✅ 代码克隆完成"
fi
cd "$WORK_DIR"

# ---- Step 3: 创建虚拟环境 ----
echo ""
echo "[3/6] 创建虚拟环境..."
if command -v conda &>/dev/null; then
    if conda env list | grep -q "^${CONDA_ENV_NAME} "; then
        echo "⚠️  conda 环境 ${CONDA_ENV_NAME} 已存在，跳过创建"
    else
        conda create -n "$CONDA_ENV_NAME" python="$PYTHON_VERSION" -y
        echo "✅ conda 环境创建完成"
    fi
    eval "$(conda shell.bash hook)"
    conda activate "$CONDA_ENV_NAME"
elif command -v python3 &>/dev/null; then
    if [ -d "$WORK_DIR/.venv" ]; then
        echo "⚠️  venv 已存在，跳过创建"
    else
        python3 -m venv "$WORK_DIR/.venv"
        echo "✅ venv 创建完成"
    fi
    source "$WORK_DIR/.venv/bin/activate"
else
    echo "❌ 未找到 conda 或 python3，请先安装"
    exit 1
fi

# ---- Step 4: 安装依赖 ----
echo ""
echo "[4/6] 安装依赖..."

# 检测 CUDA 版本
CUDA_VERSION=$(nvidia-smi | grep "CUDA Version" | awk '{print $9}' || echo "11.8")
echo "   检测到 CUDA 版本: ${CUDA_VERSION:-11.8}"

# 安装 PyTorch（根据 CUDA 版本选择）
if [ -z "$CUDA_VERSION" ]; then
    CUDA_VERSION="11.8"
fi

# 提取主版本号
CUDA_MAJOR=$(echo "$CUDA_VERSION" | cut -d. -f1)
CUDA_MINOR=$(echo "$CUDA_VERSION" | cut -d. -f2)

if [ "$CUDA_MAJOR" -ge 12 ] 2>/dev/null; then
    echo "   安装 PyTorch (CUDA ${CUDA_VERSION})..."
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
else
    echo "   安装 PyTorch (CUDA 11.8)..."
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
fi

# 安装 SGC 项目依赖
echo "   安装 SGC 项目依赖..."
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
else
    # SGC 项目没有 requirements.txt，手动安装已知依赖
    pip install numpy scipy scikit-learn matplotlib tqdm
fi

echo "✅ 依赖安装完成"

# ---- Step 5: 验证安装 ----
echo ""
echo "[5/6] 验证安装..."
python -c "
import torch
print(f'   PyTorch: {torch.__version__}')
print(f'   CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'   GPU: {torch.cuda.get_device_name(0)}')
    print(f'   GPU Memory: {torch.cuda.get_device_properties(0).total_mem / 1024**3:.1f} GB')

import numpy as np
print(f'   NumPy: {np.__version__}')

import scipy
print(f'   SciPy: {scipy.__version__}')

import sklearn
print(f'   scikit-learn: {sklearn.__version__}')

print('   ✅ 所有依赖验证通过')
"

# ---- Step 6: 启动训练 ----
echo ""
echo "[6/6] 启动训练..."
echo "=========================================="
echo ""
echo "📋 训练命令参考："
echo ""
echo "  # Cora 数据集（默认）"
echo "  cd $WORK_DIR && python main.py --dataset Cora --epochs 100 --lr 0.1 --weight-decay 5e-6"
echo ""
echo "  # Citeseer 数据集"
echo "  cd $WORK_DIR && python main.py --dataset Citeseer --epochs 100 --lr 0.1 --weight-decay 5e-6"
echo ""
echo "  # Pubmed 数据集"
echo "  cd $WORK_DIR && python main.py --dataset Pubmed --epochs 100 --lr 0.05 --weight-decay 1e-5"
echo ""
echo "=========================================="

# 检查 main.py 的参数格式
echo ""
echo "📋 项目文件结构："
ls -la "$WORK_DIR/"
echo ""

# 自动启动 Cora 训练
echo "🚀 正在启动 Cora 数据集训练..."
echo "   (使用 nohup 后台运行，日志输出到 train_cora.log)"
echo ""

cd "$WORK_DIR"
nohup python main.py --dataset Cora --epochs 100 --lr 0.1 --weight-decay 5e-6 > train_cora.log 2>&1 &
TRAIN_PID=$!

echo "✅ 训练已启动！PID: $TRAIN_PID"
echo "   查看日志: tail -f $WORK_DIR/train_cora.log"
echo "   查看进程: ps aux | grep main.py"
echo "   停止训练: kill $TRAIN_PID"
echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="

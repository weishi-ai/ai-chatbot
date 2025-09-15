import { NextResponse } from 'next/server';
import { z } from 'zod';
import OSS from 'ali-oss';

import { auth } from '@/app/(auth)/auth';

// 豆包视觉模型识别图片内容
async function recognizeImageWithDoubao(imageUrl: string): Promise<string> {
  const baseUrl = process.env.DOUBAO_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
  const apiKey = process.env.DOUBAO_API_KEY || 'ade655b0-cce1-4d70-9863-89b03adac124';

  try {
    const response = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'doubao-1.5-vision-pro-250328', // 使用支持视觉的模型
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请识别这张图片中的内容，包括文字、物体、场景等，尽可能详细地描述。'
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        max_tokens: 2048,
        temperature: 0.3,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('豆包视觉API错误:', errorText);
      return '图片识别失败';
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '未能识别图片内容';
  } catch (error) {
    console.error('图片识别错误:', error);
    return '图片识别失败';
  }
}

// 文件验证规则
const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 10 * 1024 * 1024, {
      message: '文件大小不能超过 10MB',
    })
    // 支持更多文件类型
    .refine((file) => {
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      return allowedTypes.includes(file.type);
    }, {
      message: '不支持的文件类型',
    }),
});

// 初始化 OSS 客户端
function createOSSClient() {
  return new OSS({
    region: process.env.OSS_REGION || 'oss-cn-hangzhou',
    endpoint: process.env.OSS_ENDPOINT || 'oss-cn-hangzhou.aliyuncs.com',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
    bucket: process.env.OSS_BUCKET!,
  });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (request.body === null) {
    return new Response('Request body is empty', { status: 400 });
  }

  try {
    // 检查 OSS 配置
    const requiredEnvVars = ['OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET', 'OSS_BUCKET'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      return NextResponse.json({ 
        error: `OSS 配置缺失：${missingVars.join(', ')}。请在 .env.local 中配置这些环境变量。` 
      }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as Blob;

    if (!file) {
      return NextResponse.json({ error: '未选择文件' }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(', ');

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // 获取文件信息
    const originalFilename = (formData.get('file') as File).name;
    const fileExtension = originalFilename.split('.').pop();
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    
    // 生成唯一文件名：时间戳_随机字符串.扩展名
    const filename = `education/${timestamp}_${randomString}.${fileExtension}`;
    
    const fileBuffer = await file.arrayBuffer();

    try {
      // 初始化 OSS 客户端
      const client = createOSSClient();
      
      // 上传文件到 OSS
      const result = await client.put(filename, Buffer.from(fileBuffer), {
        headers: {
          'Content-Type': file.type,
        },
      });

      console.log('文件上传成功:', result.url);

      // 如果是图片文件，进行内容识别
      let recognizedText = '';
      if (file.type.startsWith('image/')) {
        console.log('开始识别图片内容...');
        recognizedText = await recognizeImageWithDoubao(result.url);
        console.log('图片识别结果:', recognizedText);
      }

      return NextResponse.json({
        url: result.url,
        name: originalFilename,
        pathname: filename,
        contentType: file.type,
        size: file.size,
        recognizedText, // 添加识别的文本内容
      });
    } catch (error) {
      console.error('OSS 上传失败:', error);
      return NextResponse.json({ 
        error: 'OSS 上传失败，请检查配置和网络连接' 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('文件处理失败:', error);
    return NextResponse.json(
      { error: '文件处理失败，请重试' },
      { status: 500 },
    );
  }
}

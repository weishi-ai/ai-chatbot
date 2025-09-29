import { NextResponse } from 'next/server';
import { z } from 'zod';
import OSS from 'ali-oss';

import { auth } from '@/app/(auth)/auth';


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

      return NextResponse.json({
        url: result.url,
        name: originalFilename,
        pathname: filename,
        contentType: file.type,
        size: file.size,
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

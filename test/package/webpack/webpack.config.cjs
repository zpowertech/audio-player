const path=require('node:path');
module.exports={entry:'./main.js',target:'web',output:{path:path.resolve(__dirname,'build'),filename:'bundle.js',chunkFilename:'assets/[name].[contenthash].js',publicPath:'/nested/',clean:true},devServer:{host:'127.0.0.1',port:4283,static:{directory:path.resolve(__dirname,'public'),publicPath:'/nested/',watch:false},devMiddleware:{publicPath:'/nested/'}}};
